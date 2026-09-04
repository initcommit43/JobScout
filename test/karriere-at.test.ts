import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karriereAtAdapter, parseDetailPage, parseSearchPage } from '../scrapers/karriere-at.ts';
import { fixtureText } from './helpers/fixture-datei.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';

test('die suchseite liefert stellen mit titel, firma und url', async () => {
  const jobs = parseSearchPage(await fixtureText('karriere-at', 'search.html'));

  assert.ok(jobs.length > 0, 'die Fixture muss Treffer enthalten');
  for (const job of jobs) {
    assert.equal(job.source, 'karriere.at');
    assert.ok(job.title.length > 0, 'jede Stelle braucht einen Titel');
    assert.ok(job.url.startsWith('https://www.karriere.at'), job.url);
  }
  assert.ok(
    jobs.some((job) => job.company.length > 0),
    'zumindest ein Treffer traegt einen Firmennamen',
  );
});

test('relative links werden zur absoluten url ergaenzt', async () => {
  const jobs = parseSearchPage(await fixtureText('karriere-at', 'search.html'));
  assert.equal(
    jobs.filter((job) => !job.url.startsWith('https://')).length,
    0,
    'kein relativer Link darf durchrutschen',
  );
});

test('auch die kategorieseite laesst sich lesen', async () => {
  const jobs = parseSearchPage(await fixtureText('karriere-at', 'category.html'));
  assert.ok(jobs.length > 0);
});

test('ohne vue-state kommt eine leere liste, kein fehler', () => {
  assert.deepEqual(parseSearchPage('<html><body>nichts</body></html>'), []);
  assert.deepEqual(parseSearchPage(''), []);
});

test('kaputter vue-state wirft nicht', () => {
  const html = '<script>window.VUE_INITIAL_STATE = {kaputt</script>';
  assert.deepEqual(parseSearchPage(html), []);
});

test('die detailseite ergaenzt beschreibung und datum aus json-ld', async () => {
  const basis = fixtureScrapedJob({ source: 'karriere.at', description: 'kurzer Anriss', postedAt: null });
  const job = parseDetailPage(await fixtureText('karriere-at', 'detail.html'), basis);

  assert.ok(job.description.length > basis.description.length, 'die Volltext-Beschreibung ist laenger');
  assert.doesNotMatch(job.description, /<[a-z]/i, 'im Ergebnis steht kein Markup mehr');
  assert.equal(job.title, basis.title, 'Felder ausserhalb von JSON-LD bleiben unberuehrt');
});

test('ohne json-ld bleibt der basis-job unveraendert', () => {
  const basis = fixtureScrapedJob({ source: 'karriere.at' });
  assert.deepEqual(parseDetailPage('<html><body>kein json-ld</body></html>', basis), basis);
});

test('json-ld eines anderen typs wird uebergangen', () => {
  const basis = fixtureScrapedJob({ source: 'karriere.at' });
  const html =
    '<script type="application/ld+json">{"@type":"Organization","description":"Firmenportrait"}</script>';
  assert.deepEqual(parseDetailPage(html, basis), basis);
});

test('das anfrage-schema verlangt einen suchbegriff', () => {
  assert.equal(karriereAtAdapter.kind, 'fetch');
  const keyword = karriereAtAdapter.querySchema.find((feld) => feld.key === 'keyword');
  assert.equal(keyword?.required, true);
  assert.equal(keyword?.format, 'slug', 'der Wert wird als URL-Pfadsegment benutzt');
});
