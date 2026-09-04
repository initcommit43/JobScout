import { chromium, type Page } from 'playwright';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { usableQueries } from '../lib/query-schema.ts';
import type { ScrapedJob, ScraperAdapter } from './interface.ts';

const BASE = 'https://jobs.ams.at/public/emps';
const MAX_PAGES = 10;
const JOB_OFFER_TYPES = ['SB_WKO', 'IJ', 'BA', 'BZ', 'TN'];

export interface AmsSearchResult {
  id: number;
  lastUpdatedAt?: string;
  title: string;
  summary?: string;
  company?: {
    name?: string;
    address?: { municipality?: string; federalState?: string };
  };
}

export interface AmsSearchResponse {
  results?: AmsSearchResult[];
  totalPages?: number;
}

export function parseAmsResult(treffer: AmsSearchResult): ScrapedJob {
  return {
    source: 'ams',
    url: `${BASE}/jobs/${String(treffer.id)}`,
    title: treffer.title,
    company: treffer.company?.name ?? '',
    location:
      treffer.company?.address?.municipality ??
      treffer.company?.address?.federalState ??
      'Österreich',
    description: normalizeDescription(treffer.summary ?? ''),
    postedAt: treffer.lastUpdatedAt ?? null,
  };
}

/**
 * AMS needs an internal locationId (not the free-text city name) to filter by location —
 * resolved via the same autocomplete endpoint the site's own search box uses. That call
 * HAS TO run inside the page (not a bare fetch), otherwise the API returns 401.
 * Only towns/municipalities resolve here, not federal states (e.g. "Oberösterreich"
 * finds nothing useful) — use a city plus a vicinity radius instead.
 */
export async function resolveLocationId(page: Page, ortsText: string): Promise<string | null> {
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const vorschlag = await page.evaluate(async (text: string) => {
    const antwort = await fetch(
      `/public/emps/api/suggestions/location?text=${encodeURIComponent(text)}&pageSize=1`,
    );
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as { locationId?: string }[];
    return daten[0] ?? null;
  }, ortsText);

  return vorschlag?.locationId ?? null;
}

export function buildLocationParam(ort: string, locationId: string, radiusKm?: string): string {
  const vicinity = radiusKm ?? '20';
  return `&location=${encodeURIComponent(ort)}&locationId=${locationId}&vicinity=${vicinity}`;
}

export function buildSearchUrl(keyword: string, seite: number, ortsParameter: string): string {
  const typen = JOB_OFFER_TYPES.map((typ) => `JOB_OFFER_TYPE=${typ}`).join('&');
  return `${BASE}/jobs?sortField=_SCORE&sortOrder=desc&query=${encodeURIComponent(keyword)}&page=${String(seite)}${ortsParameter}&${typen}`;
}

async function fetchSearchPage(
  page: Page,
  keyword: string,
  seite: number,
  ortsParameter: string,
): Promise<AmsSearchResponse> {
  const url = buildSearchUrl(keyword, seite, ortsParameter);
  const [antwort] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/search') && res.status() === 200, {
      timeout: 20_000,
    }),
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }),
  ]);
  return antwort.json() as Promise<AmsSearchResponse>;
}

export const amsAdapter: ScraperAdapter = {
  name: 'ams',
  kind: 'browser',
  querySchema: [
    { key: 'keyword', label: 'Suchbegriff', required: true, format: 'text', placeholder: 'junior software developer' },
    { key: 'location', label: 'Suchgebiet', required: false, format: 'text', placeholder: 'Linz' },
    // "Radius", not "Umkreis": Umkreis is what the UI calls the post-filter from
    // config/location.json. This field goes to the portal and means something else.
    { key: 'vicinity', label: 'Radius (km)', required: false, format: 'number', placeholder: '40' },
  ],

  async scrape(queries, keep, onProgress, onUnitDone) {
    const nachUrl = new Map<string, ScrapedJob>();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();

      for (const query of usableQueries(amsAdapter, queries)) {
        const keyword = query['keyword'] ?? '';
        const ort = query['location'];

        let ortsParameter = '';
        if (ort !== undefined && ort !== '') {
          const locationId = await resolveLocationId(page, ort);
          if (locationId === null) {
            console.warn(`[ams] Ort "${ort}" nicht gefunden, Filter ignoriert`);
          } else {
            ortsParameter = buildLocationParam(ort, locationId, query['vicinity']);
          }
        }

        try {
          onProgress?.(1, 1);
          const erste = await fetchSearchPage(page, keyword, 1, ortsParameter);
          const seite1 = (erste.results ?? []).map(parseAmsResult);
          for (const job of seite1) if (!nachUrl.has(job.url)) nachUrl.set(job.url, job);
          onUnitDone?.(seite1);

          const seiten = Math.min(erste.totalPages ?? 1, MAX_PAGES);
          for (let seite = 2; seite <= seiten; seite++) {
            onProgress?.(seite, seiten);
            const weitere = await fetchSearchPage(page, keyword, seite, ortsParameter);
            const jobs = (weitere.results ?? []).map(parseAmsResult);
            for (const job of jobs) if (!nachUrl.has(job.url)) nachUrl.set(job.url, job);
            onUnitDone?.(jobs);
          }
        } catch (fehler) {
          console.warn(`[ams] Suche fehlgeschlagen: ${keyword}`, fehler);
        }
      }
    } finally {
      await browser.close();
    }

    const alle = [...nachUrl.values()];
    const kandidaten = keep ? alle.filter(keep) : alle;
    console.log(`[ams] ${String(alle.length)} Treffer, ${String(kandidaten.length)} nach Orts-Gate`);
    return kandidaten;
  },
};
