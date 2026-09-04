import { sleep } from '../lib/fetch-page.ts';
import { createBatcher } from '../lib/grid-batch.ts';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { usableQueries } from '../lib/query-schema.ts';
import { searchSlug } from '../lib/slugify.ts';
import type { ScrapedJob, ScraperAdapter } from './interface.ts';

const BASE = 'https://www.jobs.at';
const UA = 'Mozilla/5.0 (compatible; Bewerbungsbot/0.1; +local)';
const GRID_BATCH_SIZE = 10;

/**
 * What a search card yields. Not a Partial<ScrapedJob>: a card is its own thing, and
 * saying so lets company and location be genuinely absent without weakening ScrapedJob,
 * where both are settled.
 */
export interface JobsAtKarte {
  source: 'jobs.at';
  url: string;
  title: string;
  company?: string | undefined;
  location?: string | undefined;
}

export function parseSearchPage(html: string): JobsAtKarte[] {
  if (html === '') return [];

  const karten = html.split(/<li\s*\n?\s*data-job="/).slice(1);
  const gesehen = new Set<string>();
  const ergebnisse: JobsAtKarte[] = [];

  for (const karte of karten) {
    const id = /^(\d+)"/.exec(karte)?.[1];
    const titel = /data-c-title="([^"]+)"/.exec(karte)?.[1];
    if (id === undefined || titel === undefined) continue;

    const url = `${BASE}/i/${id}`;
    if (gesehen.has(url)) continue;
    gesehen.add(url);

    const firma = /data-gtm-element-detail="([^"]+)"/.exec(karte)?.[1];

    // One card can carry several location links ("Lieboch, Österreich") — collect all.
    const ortsBlock = /data-job-location[^>]*>([\s\S]*?)<\/ul>/.exec(karte)?.[1];
    const orte =
      ortsBlock === undefined
        ? []
        : [...ortsBlock.matchAll(/js-locationLink[^>]*>([^<]+)<\/a>/g)].map((treffer) =>
            (treffer[1] ?? '').trim(),
          );

    ergebnisse.push({
      source: 'jobs.at',
      url,
      title: titel,
      company: firma,
      location: orte.length > 0 ? orte.join(', ') : undefined,
    });
  }

  return ergebnisse;
}

interface JsonLdJobPosting {
  '@type'?: string;
  title?: string;
  datePosted?: string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } };
  identifier?: { value?: number | string };
}

export function parseDetailPage(html: string, basis: Partial<JobsAtKarte>): ScrapedJob {
  const rueckfall: ScrapedJob = {
    source: 'jobs.at',
    url: basis.url ?? '',
    title: basis.title ?? '',
    company: basis.company ?? '',
    location: basis.location,
    description: '',
  };
  if (html === '') return rueckfall;

  const bloecke = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, roh] of bloecke) {
    if (roh === undefined) continue;
    let ld: JsonLdJobPosting;
    try {
      ld = JSON.parse(roh.trim()) as JsonLdJobPosting;
    } catch {
      continue;
    }
    if (ld['@type'] !== 'JobPosting') continue;

    const adresse = ld.jobLocation?.address;
    const ort =
      [adresse?.addressLocality, adresse?.addressRegion].filter(Boolean).join(', ') || 'Österreich';
    const id = ld.identifier?.value;

    return {
      source: 'jobs.at',
      url: id === undefined || id === null ? (basis.url ?? '') : `${BASE}/i/${String(id)}`,
      title: ld.title ?? basis.title ?? '',
      company: ld.hiringOrganization?.name ?? basis.company ?? '',
      location: ort,
      description: normalizeDescription(ld.description ?? ''),
      postedAt: ld.datePosted ?? null,
    };
  }

  // No JSON-LD is the more common case here, not the exception — only some listings
  // carry structured data. Fall back to the plain HTML article rather than returning an
  // empty description.
  const artikel = /<article class="c-job-detail-text"[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1];
  if (artikel !== undefined) {
    return { ...rueckfall, description: normalizeDescription(artikel.trim()) };
  }
  return rueckfall;
}

/**
 * ?q=<keyword> is dropped by the 302 redirect (verified — java/frontend returned
 * identical results, cookies irrelevant). The path form /j/{keyword-slug} works and
 * needs no session handling.
 */
async function fetchJobsAt(url: string): Promise<string> {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const antwort = await fetch(url, {
      signal: abbruch.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-AT,de;q=0.9' },
    });
    if (!antwort.ok) throw new Error(`jobs.at ${String(antwort.status)}: ${url}`);
    return await antwort.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSearchPage(keyword: string): Promise<string> {
  return fetchJobsAt(`${BASE}/j/${searchSlug(keyword)}`);
}

async function fetchDetailPage(url: string): Promise<string> {
  await sleep(2000);
  return fetchJobsAt(url);
}

export const jobsAtAdapter: ScraperAdapter = {
  name: 'jobs.at',
  kind: 'fetch',
  querySchema: [
    { key: 'keyword', label: 'Suchbegriff', required: true, format: 'slug', placeholder: 'java-entwickler' },
  ],

  async scrape(queries, keep, onProgress, onUnitDone) {
    const nachUrl = new Map<string, ScrapedJob>();
    const brauchbar = usableQueries(jobsAtAdapter, queries);

    for (const [index, query] of brauchbar.entries()) {
      const keyword = query['keyword'] ?? '';

      try {
        onProgress?.(index + 1, brauchbar.length);
        const karten = parseSearchPage(await fetchSearchPage(keyword));

        // The location is already on the card, so the gate runs before the detail fetch.
        const kandidaten = keep
          ? karten.filter((karte) => keep({ ...karte, company: karte.company ?? '', description: '' }))
          : karten;
        console.log(
          `[jobs.at] "${keyword}": ${String(karten.length)} Karten, ${String(kandidaten.length)} nach Gate`,
        );

        const batcher = createBatcher<ScrapedJob>(GRID_BATCH_SIZE, onUnitDone);
        for (const [kartenIndex, karte] of kandidaten.entries()) {
          if (nachUrl.has(karte.url)) continue;
          onProgress?.(kartenIndex + 1, kandidaten.length);

          let job: ScrapedJob;
          try {
            job = parseDetailPage(await fetchDetailPage(karte.url), karte);
          } catch (fehler) {
            console.warn(`[jobs.at] Detail fehlgeschlagen: ${karte.url}`, fehler);
            job = {
              source: 'jobs.at',
              url: karte.url,
              title: karte.title,
              company: karte.company ?? '',
              location: karte.location,
              description: '',
            };
          }
          nachUrl.set(karte.url, job);
          batcher.push(job);
        }
        batcher.flush();
      } catch (fehler) {
        console.warn(`[jobs.at] Suche fehlgeschlagen: ${keyword}`, fehler);
      }
    }

    return [...nachUrl.values()];
  },
};
