import { chromium, type Page } from 'playwright';
import { asArray, asNumber, asString, firstText, readPath } from '../lib/json-read.ts';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { usableQueries } from '../lib/query-schema.ts';
import type { ScrapedJob, ScraperAdapter } from './interface.ts';

const BASE = 'https://www.devjobs.at';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

/**
 * Poll window after domcontentloaded: the Remix hydration can take longer than the
 * original 15s on slow hardware or under scheduler load next to other adapters.
 */
const STATE_TIMEOUT_MS = 45_000;

/**
 * Known Remix context globals, oldest first. The key has been renamed once already —
 * the poll loop additionally scans generically for any window["__*"] carrying
 * .state.loaderData, so it survives another rename.
 */
const KNOWN_STATE_KEYS = ['__reactRouterContext', '__remixContext'];

const SUCH_ROUTE = 'routes/jobs/$canonical';
const DETAIL_ROUTE = 'routes/job/$jobSlug';

const delay = (ms: number): Promise<void> => new Promise((fertig) => setTimeout(fertig, ms));

/**
 * Exists only inside page.evaluate callbacks, which run in the browser realm. Declared
 * here rather than pulling the whole DOM lib into a Node project, where it would offer
 * browser globals to code that can never reach them.
 */
declare const window: Record<string, unknown>;

/**
 * Safe to use inside a page.evaluate callback because a type is erased before the
 * callback is serialised. A named function value would NOT be — see findStateKey.
 */
interface RemixKontext {
  state?: { loaderData?: unknown };
}

export function parseSearchResults(context: unknown): ScrapedJob[] {
  const eintraege = asArray(readPath(context, 'state', 'loaderData', SUCH_ROUTE, 'activeJobs'));
  const ergebnisse: ScrapedJob[] = [];

  for (const eintrag of eintraege) {
    const model = readPath(eintrag, 'model');
    const title = asString(readPath(model, 'metaJobTitle', 'title'));
    const company = asString(readPath(model, 'company', 'title'));
    const slug = asString(readPath(model, 'slug'));
    if (title === undefined || company === undefined || slug === undefined) continue;
    if (title === '' || company === '' || slug === '') continue;

    const von = asNumber(readPath(model, 'salaryYearRangeFrom')) ?? 0;
    const bis = asNumber(readPath(model, 'salaryYearRangeTo')) ?? 0;

    ergebnisse.push({
      source: 'devjobs.at',
      url: `${BASE}/job/${slug}`,
      title,
      company,
      location: asString(readPath(model, 'metaOsmLocations', 0, 'title')) ?? 'Österreich',
      description: normalizeDescription(asString(readPath(model, 'responsibilitiesExcerpt')) ?? ''),
      postedAt: firstText(readPath(model, 'sortedAt'), readPath(model, 'createdAt')) ?? null,
      salary: von > 0 && bis > 0 ? `${String(von)}–${String(bis)} €/Jahr` : null,
    });
  }

  return ergebnisse;
}

export function parseDetailResult(context: unknown, basisJob: ScrapedJob): ScrapedJob {
  const job = readPath(context, 'state', 'loaderData', DETAIL_ROUTE, 'job');
  if (job === undefined || job === null) return basisJob;

  const html = asString(readPath(job, 'jobDescriptionHtml', 'html'));
  const postedAt = firstText(readPath(job, 'sortedAt'), readPath(job, 'createdAt'));

  return {
    ...basisJob,
    ...(html === undefined ? {} : { description: normalizeDescription(html) }),
    ...(postedAt === undefined ? {} : { postedAt }),
  };
}

export function totalPagesFromContext(context: unknown): number {
  return asNumber(readPath(context, 'state', 'loaderData', SUCH_ROUTE, 'totalPages')) ?? 1;
}

/**
 * Finds the first window["__*"] global carrying .state.loaderData — known keys first,
 * then a generic scan.
 *
 * IMPORTANT: page.evaluate() serialises the callback as plain source and runs it in the
 * browser realm, without any Node/esbuild helpers. A const-bound named arrow function is
 * wrapped by tsx/esbuild in a __name(fn, "…") call for stack-trace names — that helper
 * does not exist in the browser and throws a ReferenceError. Hence deliberately NO named
 * helper here; the check is repeated inline instead.
 */
async function findStateKey(page: Page, keys: string[]): Promise<string | null> {
  return page.evaluate((bekannte: string[]) => {
    for (const key of bekannte) {
      const state = (window[key] as RemixKontext | undefined)?.state;
      if (state?.loaderData !== undefined && state.loaderData !== null) return key;
    }
    for (const key of Object.keys(window)) {
      if (!key.startsWith('__')) continue;
      const state = (window[key] as RemixKontext | undefined)?.state;
      if (state?.loaderData !== undefined && state.loaderData !== null) return key;
    }
    return null;
  }, keys);
}

/**
 * A diagnostic dump instead of a blind timeout error: shows at the next failure whether
 * the context key changed again (→ add it to KNOWN_STATE_KEYS) or whether it was purely
 * timing (→ raise STATE_TIMEOUT_MS).
 */
async function diagnoseTimeout(page: Page): Promise<void> {
  try {
    const titel = await page.title();
    const globals = await page.evaluate(() => Object.keys(window).filter((key) => key.startsWith('__')));
    console.warn(
      `[devjobs.at] State-Timeout Diagnose: titel="${titel}", __-Globals=${JSON.stringify(globals)}`,
    );
  } catch (fehler) {
    console.warn('[devjobs.at] Diagnose-Dump fehlgeschlagen', fehler);
  }
}

async function waitForState(page: Page, timeoutMs = STATE_TIMEOUT_MS): Promise<unknown> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const key = await findStateKey(page, KNOWN_STATE_KEYS);
    if (key !== null) {
      return page.evaluate((k: string) => window[k], key);
    }
    await delay(200);
  }
  await diagnoseTimeout(page);
  throw new Error('devjobs.at: kein Kontext mit .state.loaderData gefunden (Timeout)');
}

export async function fetchRemixContext(url: string): Promise<unknown> {
  const browser = await chromium.launch({ headless: true });
  try {
    const kontext = await browser.newContext({ userAgent: UA });
    const page = await kontext.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    return await waitForState(page);
  } finally {
    await browser.close();
  }
}

export const devJobsAtAdapter: ScraperAdapter = {
  name: 'devjobs.at',
  kind: 'browser',
  // The only portal without a search term: devjobs.at filters through a ready-made query
  // string that is appended to the URL unchanged.
  querySchema: [
    {
      key: 'params',
      label: 'Filter (Query-String)',
      required: true,
      format: 'raw',
      placeholder: 'jobLevel=junior-job-level',
    },
  ],

  async scrape(queries, keep, onProgress, onUnitDone) {
    const basisJobs: ScrapedJob[] = [];

    for (const query of usableQueries(devJobsAtAdapter, queries)) {
      const basisUrl = `${BASE}/jobs/search?${query['params'] ?? ''}`;

      onProgress?.(1, 1);
      const ersterKontext = await fetchRemixContext(basisUrl);
      const seiten = Math.min(totalPagesFromContext(ersterKontext), MAX_PAGES);

      const seite1 = parseSearchResults(ersterKontext);
      basisJobs.push(...seite1);
      onUnitDone?.(seite1);

      for (let seite = 2; seite <= seiten; seite++) {
        await delay(2000);
        onProgress?.(seite, seiten);
        try {
          const jobs = parseSearchResults(await fetchRemixContext(`${basisUrl}&page=${String(seite)}`));
          basisJobs.push(...jobs);
          onUnitDone?.(jobs);
        } catch (fehler) {
          console.warn(
            `[devjobs.at] Suchseite ${String(seite)} fehlgeschlagen, breche Pagination ab (behalte ${String(basisJobs.length)} Treffer)`,
            fehler,
          );
          break;
        }
      }
    }

    const kandidaten = keep ? basisJobs.filter(keep) : basisJobs;
    console.log(
      `[devjobs.at] ${String(basisJobs.length)} Treffer, ${String(kandidaten.length)} nach Orts-Gate`,
    );

    const ergebnisse: ScrapedJob[] = [];
    for (const [index, job] of kandidaten.entries()) {
      await delay(2000);
      onProgress?.(index + 1, kandidaten.length);
      try {
        ergebnisse.push(parseDetailResult(await fetchRemixContext(job.url), job));
      } catch (fehler) {
        console.warn(`[devjobs.at] Detail fehlgeschlagen: ${job.url}`, fehler);
        ergebnisse.push(job);
      }
    }

    return ergebnisse;
  },
};
