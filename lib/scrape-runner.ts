import type { ScrapedJob, ScraperAdapter, SourceQuery } from '../scrapers/interface.ts';
import type { Storage } from '../storage/index.ts';
import { jobId } from './hash.ts';
import { toJob } from './normalize.ts';

export interface SourceOutcome {
  name: string;
  ok: boolean;
  newCount: number;
  skipCount: number;
  error?: unknown;
}

export interface RunScrapeOptions {
  names: string[];
  registry: Record<string, ScraperAdapter>;
  queriesFor: (name: string) => SourceQuery[];
  keep?: (job: ScrapedJob) => boolean;
  storage: Storage;
  onProgress?: (name: string, current: number, total: number) => void;
  onUnitDone?: (name: string, items: ScrapedJob[]) => void;
  maxConcurrent?: number;
  maxBrowsers?: number;
}

/**
 * ONE scheduler instead of two independent semaphores: acquire() checks BOTH limits
 * atomically and only commits when both have room, rather than partly occupying one of
 * the two quotas while waiting.
 *
 * Do not "simplify" this into two semaphores. That is what it was, and it starved in a
 * live run: a browser adapter grabbed the scarce browser slot first, then hung in the
 * overall-slot queue — blocking the second browser adapter from its otherwise free
 * browser slot, for minutes at a time. release() wakes everyone; only those who satisfy
 * both limits right now actually get through.
 */
function createScheduler(
  maxConcurrent: number,
  maxBrowsers: number,
): { acquire: (istBrowser: boolean) => Promise<void>; release: (istBrowser: boolean) => void } {
  let aktiv = 0;
  let aktiveBrowser = 0;
  let warteschlange: (() => void)[] = [];

  function tryAcquire(istBrowser: boolean): boolean {
    if (aktiv >= maxConcurrent) return false;
    if (istBrowser && aktiveBrowser >= maxBrowsers) return false;
    aktiv++;
    if (istBrowser) aktiveBrowser++;
    return true;
  }

  async function acquire(istBrowser: boolean): Promise<void> {
    while (!tryAcquire(istBrowser)) {
      await new Promise<void>((weiter) => warteschlange.push(weiter));
    }
  }

  function release(istBrowser: boolean): void {
    aktiv--;
    if (istBrowser) aktiveBrowser--;
    const wartende = warteschlange;
    warteschlange = [];
    for (const weiter of wartende) weiter();
  }

  return { acquire, release };
}

/**
 * All sources in parallel but throttled: at most `maxConcurrent` adapters overall AND at
 * most `maxBrowsers` kind:'browser' adapters at once — never two Playwright browsers
 * fighting over local CPU and network. allSettled stays: one adapter's failure must not
 * stop the others.
 *
 * Dedup and save run sequentially AFTER all results are in, which prevents write races
 * when the same posting turns up on two sources with the same jobId.
 */
export async function runScrape(options: RunScrapeOptions): Promise<SourceOutcome[]> {
  const {
    names,
    registry,
    queriesFor,
    keep,
    storage,
    onProgress,
    onUnitDone,
    maxConcurrent = 2,
    maxBrowsers = 1,
  } = options;

  const scheduler = createScheduler(maxConcurrent, maxBrowsers);

  const abgeschlossen = await Promise.allSettled(
    names.map(async (name) => {
      // Without this line a source name without an adapter turned into "Cannot read
      // properties of undefined (reading 'kind')" — disguised as a source failure,
      // without saying what was actually wrong.
      const adapter = registry[name];
      if (adapter === undefined) {
        throw new Error(
          `Kein Adapter fuer Quelle "${name}" — bekannt sind: ${Object.keys(registry).join(', ')}`,
        );
      }

      const istBrowser = adapter.kind === 'browser';
      await scheduler.acquire(istBrowser);
      try {
        return await adapter.scrape(
          queriesFor(name),
          keep,
          (current, total) => onProgress?.(name, current, total),
          (items) => onUnitDone?.(name, items),
        );
      } finally {
        scheduler.release(istBrowser);
      }
    }),
  );

  const ergebnisse: SourceOutcome[] = [];
  for (const [index, name] of names.entries()) {
    const abgeschlossenes = abgeschlossen[index];
    if (abgeschlossenes === undefined) continue;

    if (abgeschlossenes.status === 'rejected') {
      ergebnisse.push({ name, ok: false, newCount: 0, skipCount: 0, error: abgeschlossenes.reason });
      continue;
    }

    let newCount = 0;
    let skipCount = 0;
    for (const scraped of abgeschlossenes.value) {
      if (await storage.exists(jobId(scraped))) {
        skipCount++;
      } else {
        await storage.save(toJob(scraped));
        newCount++;
      }
    }
    ergebnisse.push({ name, ok: true, newCount, skipCount });
  }

  return ergebnisse;
}
