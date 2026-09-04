import { fetchPage, sleep } from '../lib/fetch-page.ts';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { usableQueries } from '../lib/query-schema.ts';
import type { ScrapedJob, ScraperAdapter } from './interface.ts';

const SEARCH_BASE = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const PAGES = [0, 25, 50];

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

export function parseSearchResults(html: string): ScrapedJob[] {
  if (html === '') return [];

  const karten = html.split('<li>').slice(1);
  const ergebnisse: ScrapedJob[] = [];

  for (const karte of karten) {
    const url = /class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/.exec(karte)?.[1];
    const titel = /<h3 class="base-search-card__title">\s*([\s\S]*?)\s*<\/h3>/.exec(karte)?.[1];
    const firma = /<h4 class="base-search-card__subtitle">[\s\S]*?>\s*([^<]+?)\s*<\/a>/.exec(karte)?.[1];
    const ort = /<span class="job-search-card__location">\s*([^<]+?)\s*<\/span>/.exec(karte)?.[1];
    const datum = /<time class="job-search-card__listdate"[^>]*datetime="([^"]+)"/.exec(karte)?.[1];

    if (url === undefined || titel === undefined || firma === undefined) continue;

    ergebnisse.push({
      source: 'linkedin',
      // Tracking parameters would make the same posting look like a new one.
      url: decodeEntities(url).split('?')[0] ?? '',
      title: decodeEntities(titel.trim()),
      company: decodeEntities(firma.trim()),
      location: ort === undefined ? undefined : decodeEntities(ort.trim()),
      description: '',
      postedAt: datum ?? null,
    });
  }

  return ergebnisse;
}

export function parseDetailPage(html: string, basisJob: ScrapedJob): ScrapedJob {
  if (html === '') return basisJob;
  const markup = /show-more-less-html__markup[^>]*>([\s\S]*?)<button/.exec(html)?.[1];
  if (markup === undefined) return basisJob;
  return { ...basisJob, description: normalizeDescription(markup.trim()) };
}

async function fetchSearchPage(keyword: string, ort: string, start: number): Promise<string> {
  const url = `${SEARCH_BASE}?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(ort)}&start=${String(start)}`;
  const antwort = await fetchPage(url);
  if (!antwort.ok) throw new Error(`linkedin Suche ${String(antwort.status)}: ${keyword}`);
  return antwort.html;
}

async function fetchDetailPage(url: string): Promise<string> {
  await sleep(2000);
  const antwort = await fetchPage(url);
  if (!antwort.ok) throw new Error(`linkedin Detail ${String(antwort.status)}: ${url}`);
  return antwort.html;
}

export const linkedinAdapter: ScraperAdapter = {
  name: 'linkedin',
  // Uses fetchPage (plain HTTP) through the guest endpoint — no Playwright browser.
  kind: 'fetch',
  querySchema: [
    { key: 'keyword', label: 'Suchbegriff', required: true, format: 'text', placeholder: 'junior software developer' },
    // format 'text', not 'slug': the value goes verbatim into ?keywords= / ?location=.
    { key: 'location', label: 'Suchgebiet', required: false, format: 'text', placeholder: 'Oberösterreich, Österreich' },
  ],

  async scrape(queries, keep, onProgress, onUnitDone) {
    const nachUrl = new Map<string, ScrapedJob>();

    for (const query of usableQueries(linkedinAdapter, queries)) {
      const keyword = query['keyword'] ?? '';
      const ort = query['location'] ?? 'Österreich';

      for (const [index, start] of PAGES.entries()) {
        try {
          onProgress?.(index + 1, PAGES.length);
          const jobs = parseSearchResults(await fetchSearchPage(keyword, ort, start));
          for (const job of jobs) if (!nachUrl.has(job.url)) nachUrl.set(job.url, job);
          onUnitDone?.(jobs);
        } catch (fehler) {
          console.warn(`[linkedin] Suche fehlgeschlagen: ${keyword}@${String(start)}`, fehler);
        }
        await sleep(1000);
      }
    }

    const alle = [...nachUrl.values()];
    const kandidaten = keep ? alle.filter(keep) : alle;
    console.log(`[linkedin] ${String(alle.length)} Treffer, ${String(kandidaten.length)} nach Orts-Gate`);

    const ergebnisse: ScrapedJob[] = [];
    for (const [index, job] of kandidaten.entries()) {
      onProgress?.(index + 1, kandidaten.length);
      try {
        ergebnisse.push(parseDetailPage(await fetchDetailPage(job.url), job));
      } catch (fehler) {
        console.warn(`[linkedin] Detail fehlgeschlagen: ${job.url}`, fehler);
        ergebnisse.push(job);
      }
    }

    return ergebnisse;
  },
};
