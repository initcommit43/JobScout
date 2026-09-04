import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScrape } from '../lib/scrape-runner.ts';
import { createStorage } from '../storage/index.ts';
import type { ScrapedJob, ScraperAdapter } from '../scrapers/interface.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';
import { tmpArbeitsverzeichnis } from './helpers/fixtures.ts';

interface Protokoll {
  gleichzeitig: number;
  hoechstensGleichzeitig: number;
  browserGleichzeitig: number;
  hoechstensBrowser: number;
}

/**
 * An adapter that records how many adapters ran alongside it, so the scheduler's limits
 * can be observed instead of merely assumed.
 */
function testAdapter(
  name: string,
  kind: 'fetch' | 'browser',
  protokoll: Protokoll,
  optionen: { jobs?: ScrapedJob[]; dauerMs?: number; fehler?: Error } = {},
): ScraperAdapter {
  return {
    name,
    kind,
    querySchema: [{ key: 'keyword', label: 'Suchbegriff', required: true, format: 'slug' }],
    async scrape() {
      protokoll.gleichzeitig += 1;
      protokoll.hoechstensGleichzeitig = Math.max(protokoll.hoechstensGleichzeitig, protokoll.gleichzeitig);
      if (kind === 'browser') {
        protokoll.browserGleichzeitig += 1;
        protokoll.hoechstensBrowser = Math.max(protokoll.hoechstensBrowser, protokoll.browserGleichzeitig);
      }
      try {
        await new Promise((fertig) => setTimeout(fertig, optionen.dauerMs ?? 20));
        if (optionen.fehler) throw optionen.fehler;
        return optionen.jobs ?? [];
      } finally {
        protokoll.gleichzeitig -= 1;
        if (kind === 'browser') protokoll.browserGleichzeitig -= 1;
      }
    },
  };
}

function leeresProtokoll(): Protokoll {
  return { gleichzeitig: 0, hoechstensGleichzeitig: 0, browserGleichzeitig: 0, hoechstensBrowser: 0 };
}

test('neue stellen werden gespeichert und gezaehlt', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const jobs = [
    fixtureScrapedJob({ title: 'Entwickler', url: 'https://example.com/1' }),
    fixtureScrapedJob({ title: 'Testerin', url: 'https://example.com/2' }),
  ];
  const storage = createStorage();

  const ergebnis = await runScrape({
    names: ['portal'],
    registry: { portal: testAdapter('portal', 'fetch', protokoll, { jobs }) },
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage,
  });

  assert.deepEqual(ergebnis, [{ name: 'portal', ok: true, newCount: 2, skipCount: 0 }]);
  assert.equal((await storage.list()).length, 2);
});

test('ein zweiter lauf legt dieselbe stelle nicht noch einmal an', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const jobs = [fixtureScrapedJob()];
  const storage = createStorage();
  const optionen = {
    names: ['portal'],
    registry: { portal: testAdapter('portal', 'fetch', protokoll, { jobs }) },
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage,
  };

  await runScrape(optionen);
  const zweiter = await runScrape(optionen);

  assert.deepEqual(zweiter, [{ name: 'portal', ok: true, newCount: 0, skipCount: 1 }]);
  assert.equal((await storage.list()).length, 1, 'genau eine Datei');
});

test('dieselbe stelle auf zwei portalen wird nur einmal gespeichert', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const storage = createStorage();
  // Gleicher Titel und gleiche Firma, unterschiedliche URL — genau der Fall, fuer den
  // die ID aus Titel und Firma gebildet wird.
  const aufA = fixtureScrapedJob({ source: 'a', url: 'https://a.example.com/1' });
  const aufB = fixtureScrapedJob({ source: 'b', url: 'https://b.example.com/9' });

  const ergebnis = await runScrape({
    names: ['a', 'b'],
    registry: {
      a: testAdapter('a', 'fetch', protokoll, { jobs: [aufA] }),
      b: testAdapter('b', 'fetch', protokoll, { jobs: [aufB] }),
    },
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage,
  });

  assert.equal((await storage.list()).length, 1);
  assert.equal(ergebnis.reduce((summe, quelle) => summe + quelle.newCount, 0), 1);
  assert.equal(ergebnis.reduce((summe, quelle) => summe + quelle.skipCount, 0), 1);
});

test('ein fehlgeschlagenes portal stoppt die anderen nicht', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const storage = createStorage();

  const ergebnis = await runScrape({
    names: ['kaputt', 'heil'],
    registry: {
      kaputt: testAdapter('kaputt', 'fetch', protokoll, { fehler: new Error('Portal down') }),
      heil: testAdapter('heil', 'fetch', protokoll, { jobs: [fixtureScrapedJob()] }),
    },
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage,
  });

  assert.equal(ergebnis[0]?.ok, false);
  assert.match(String((ergebnis[0]?.error as Error).message), /Portal down/);
  assert.equal(ergebnis[1]?.ok, true);
  assert.equal(ergebnis[1]?.newCount, 1);
});

test('ein unbekanntes portal sagt, welche es gibt', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();

  const ergebnis = await runScrape({
    names: ['tippfehler'],
    registry: { portal: testAdapter('portal', 'fetch', protokoll) },
    queriesFor: () => [],
    storage: createStorage(),
  });

  assert.equal(ergebnis[0]?.ok, false);
  const meldung = String((ergebnis[0]?.error as Error).message);
  assert.match(meldung, /Kein Adapter fuer Quelle "tippfehler"/);
  assert.match(meldung, /bekannt sind: portal/);
});

test('nie mehr adapter gleichzeitig als erlaubt', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const namen = ['a', 'b', 'c', 'd'];

  await runScrape({
    names: namen,
    registry: Object.fromEntries(namen.map((name) => [name, testAdapter(name, 'fetch', protokoll)])),
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage: createStorage(),
    maxConcurrent: 2,
  });

  assert.equal(protokoll.hoechstensGleichzeitig, 2);
});

test('nie zwei browser gleichzeitig', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const namen = ['b1', 'b2', 'b3'];

  await runScrape({
    names: namen,
    registry: Object.fromEntries(namen.map((name) => [name, testAdapter(name, 'browser', protokoll)])),
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage: createStorage(),
    maxConcurrent: 3,
    maxBrowsers: 1,
  });

  assert.equal(protokoll.hoechstensBrowser, 1);
});

test('ein browser-adapter laesst die fetch-adapter nicht verhungern', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  // Genau die Aufstellung, die mit zwei getrennten Semaphoren Starvation ausloeste:
  // ein langsamer Browser haelt den knappen Browser-Slot, waehrend weitere Adapter
  // warten. Mit einem Scheduler, der beide Limits atomar prueft, laufen alle durch.
  const registry = {
    browser1: testAdapter('browser1', 'browser', protokoll, { dauerMs: 60 }),
    browser2: testAdapter('browser2', 'browser', protokoll, { dauerMs: 60 }),
    fetch1: testAdapter('fetch1', 'fetch', protokoll, { jobs: [fixtureScrapedJob()] }),
  };

  const ergebnis = await runScrape({
    names: ['browser1', 'browser2', 'fetch1'],
    registry,
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage: createStorage(),
    maxConcurrent: 2,
    maxBrowsers: 1,
  });

  assert.ok(ergebnis.every((quelle) => quelle.ok), 'jede Quelle muss durchlaufen');
  assert.equal(protokoll.hoechstensBrowser, 1);
  assert.equal(protokoll.hoechstensGleichzeitig, 2);
  assert.equal(protokoll.gleichzeitig, 0, 'am Ende ist jeder Slot wieder frei');
});

test('fortschritt und fertige einheiten werden je quelle gemeldet', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const protokoll = leeresProtokoll();
  const meldungen: string[] = [];
  const einheiten: string[] = [];

  const adapter: ScraperAdapter = {
    name: 'portal',
    kind: 'fetch',
    querySchema: [{ key: 'keyword', label: 'Suchbegriff', required: true, format: 'slug' }],
    scrape(_queries, _keep, onProgress, onUnitDone) {
      onProgress?.(1, 2);
      onUnitDone?.([fixtureScrapedJob()]);
      onProgress?.(2, 2);
      return Promise.resolve([fixtureScrapedJob()]);
    },
  };

  await runScrape({
    names: ['portal'],
    registry: { portal: adapter },
    queriesFor: () => [{ keyword: 'entwickler' }],
    storage: createStorage(),
    onProgress: (name, current, total) => meldungen.push(`${name} ${String(current)}/${String(total)}`),
    onUnitDone: (name, items) => einheiten.push(`${name}:${String(items.length)}`),
  });

  assert.deepEqual(meldungen, ['portal 1/2', 'portal 2/2']);
  assert.deepEqual(einheiten, ['portal:1']);
  assert.equal(protokoll.hoechstensGleichzeitig, 0, 'dieser Adapter zaehlt nicht mit');
});

test('der keep-filter wird an den adapter durchgereicht', async (t) => {
  await tmpArbeitsverzeichnis(t);
  let erhalten: ((job: ScrapedJob) => boolean) | undefined;

  const adapter: ScraperAdapter = {
    name: 'portal',
    kind: 'fetch',
    querySchema: [],
    scrape(_queries, keep) {
      erhalten = keep;
      return Promise.resolve([]);
    },
  };
  const keep = (job: ScrapedJob): boolean => job.location === 'Wien';

  await runScrape({
    names: ['portal'],
    registry: { portal: adapter },
    queriesFor: () => [],
    keep,
    storage: createStorage(),
  });

  assert.equal(erhalten, keep);
});
