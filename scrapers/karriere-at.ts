import { fetchPage, sleep } from '../lib/fetch-page.ts';
import { createBatcher } from '../lib/grid-batch.ts';
import { asArray, asString, firstText, readPath } from '../lib/json-read.ts';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { usableQueries } from '../lib/query-schema.ts';
import { searchSlug } from '../lib/slugify.ts';
import type { ScrapedJob, ScraperAdapter } from './interface.ts';

const BASE = 'https://www.karriere.at';
const GRID_BATCH_SIZE = 10;

/**
 * indexOf plus trim is enough — the script block holds exactly one assignment, so no
 * brace balancing is needed.
 */
function extractVueState(html: string): unknown {
  const start = html.indexOf('window.VUE_INITIAL_STATE');
  if (start === -1) return null;
  const ende = html.indexOf('</script>', start);
  if (ende === -1) return null;

  const json = html
    .slice(start, ende)
    .trim()
    .replace(/^window\.VUE_INITIAL_STATE\s*=\s*/, '')
    .replace(/;\s*$/, '');

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export function parseSearchPage(html: string): ScrapedJob[] {
  const state = extractVueState(html);
  const eintraege = asArray(readPath(state, 'jobsSearchList', 'activeItems', 'items'));

  return eintraege.flatMap((eintrag): ScrapedJob[] => {
    const item = readPath(eintrag, 'jobsItem');
    const title = asString(readPath(item, 'title'));
    const link = asString(readPath(item, 'link'));
    if (title === undefined || link === undefined) return [];

    return [
      {
        source: 'karriere.at',
        url: link.startsWith('http') ? link : `${BASE}${link}`,
        title,
        company: asString(readPath(item, 'company', 'name')) ?? '',
        location: firstText(
          readPath(item, 'locations', 0, 'name'),
          readPath(item, 'company', 'mainLocation'),
        ),
        description: normalizeDescription(asString(readPath(item, 'snippet')) ?? ''),
        salary: asString(readPath(item, 'salary')) ?? null,
        postedAt: null,
      },
    ];
  });
}

interface JsonLdJobPosting {
  '@type'?: string;
  description?: string;
  datePosted?: string;
}

export function parseDetailPage(html: string, basisJob: ScrapedJob): ScrapedJob {
  const bloecke = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, roh] of bloecke) {
    if (roh === undefined) continue;
    let ld: JsonLdJobPosting;
    try {
      ld = JSON.parse(roh.trim()) as JsonLdJobPosting;
    } catch {
      continue;
    }
    if (ld['@type'] !== 'JobPosting') continue;

    return {
      ...basisJob,
      ...(ld.description === undefined ? {} : { description: normalizeDescription(ld.description) }),
      ...(ld.datePosted === undefined ? {} : { postedAt: ld.datePosted }),
    };
  }

  return basisJob;
}

async function fetchSearchPage(keyword: string): Promise<string> {
  const antwort = await fetchPage(`${BASE}/jobs/${searchSlug(keyword)}`);
  if (!antwort.ok) throw new Error(`karriere.at Suche ${String(antwort.status)}: ${keyword}`);
  return antwort.html;
}

async function fetchDetailPage(url: string): Promise<string> {
  await sleep(2000);
  const antwort = await fetchPage(url);
  if (!antwort.ok) throw new Error(`karriere.at Detail ${String(antwort.status)}: ${url}`);
  return antwort.html;
}

export const karriereAtAdapter: ScraperAdapter = {
  name: 'karriere.at',
  kind: 'fetch',
  querySchema: [
    { key: 'keyword', label: 'Suchbegriff', required: true, format: 'slug', placeholder: 'junior-entwickler' },
  ],

  async scrape(queries, keep, onProgress, onUnitDone) {
    const nachUrl = new Map<string, ScrapedJob>();
    const brauchbar = usableQueries(karriereAtAdapter, queries);

    for (const [index, query] of brauchbar.entries()) {
      const keyword = query['keyword'] ?? '';
      try {
        onProgress?.(index + 1, brauchbar.length);
        for (const job of parseSearchPage(await fetchSearchPage(keyword))) {
          if (!nachUrl.has(job.url)) nachUrl.set(job.url, job);
        }
      } catch (fehler) {
        console.warn(`[karriere.at] Suche fehlgeschlagen: ${keyword}`, fehler);
      }
    }

    const alle = [...nachUrl.values()];
    const kandidaten = keep ? alle.filter(keep) : alle;
    console.log(`[karriere.at] ${String(alle.length)} Treffer, ${String(kandidaten.length)} nach Orts-Gate`);

    const ergebnisse: ScrapedJob[] = [];
    const batcher = createBatcher<ScrapedJob>(GRID_BATCH_SIZE, onUnitDone);

    for (const [index, job] of kandidaten.entries()) {
      onProgress?.(index + 1, kandidaten.length);
      let gefunden = job;
      try {
        gefunden = parseDetailPage(await fetchDetailPage(job.url), job);
      } catch (fehler) {
        console.warn(`[karriere.at] Detail fehlgeschlagen: ${job.url}`, fehler);
      }
      ergebnisse.push(gefunden);
      batcher.push(gefunden);
    }
    batcher.flush();

    return ergebnisse;
  },
};

