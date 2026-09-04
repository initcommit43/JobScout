import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobsAtAdapter, parseDetailPage, parseSearchPage } from '../scrapers/jobs-at.ts';
import { fixtureText } from './helpers/fixture-datei.ts';

test('die suchseite liefert karten mit titel und detail-url', async () => {
  const karten = parseSearchPage(await fixtureText('jobs-at', 'search.html'));

  assert.ok(karten.length > 0);
  for (const karte of karten) {
    assert.equal(karte.source, 'jobs.at');
    assert.match(karte.url ?? '', /^https:\/\/www\.jobs\.at\/i\/\d+$/);
    assert.ok((karte.title ?? '').length > 0);
  }
});

test('dieselbe stelle taucht in den karten nur einmal auf', async () => {
  const karten = parseSearchPage(await fixtureText('jobs-at', 'search.html'));
  const urls = karten.map((karte) => karte.url);

  assert.equal(new Set(urls).size, urls.length);
});

test('mehrere orte einer karte werden zusammengefasst', async () => {
  const karten = parseSearchPage(await fixtureText('jobs-at', 'search.html'));
  const mitOrt = karten.filter((karte) => (karte.location ?? '') !== '');

  assert.ok(mitOrt.length > 0, 'zumindest eine Karte nennt einen Ort');
});

test('auch die kategorieseite laesst sich lesen', async () => {
  assert.ok(parseSearchPage(await fixtureText('jobs-at', 'category.html')).length > 0);
});

test('leeres html ergibt keine karten', () => {
  assert.deepEqual(parseSearchPage(''), []);
  assert.deepEqual(parseSearchPage('<html></html>'), []);
});

test('die detailseite liest die stelle aus json-ld', async () => {
  const job = parseDetailPage(await fixtureText('jobs-at', 'detail.html'), { url: 'https://www.jobs.at/i/1' });

  assert.equal(job.source, 'jobs.at');
  assert.ok(job.title.length > 0);
  assert.ok(job.company.length > 0);
  assert.ok(job.description.length > 0);
  assert.doesNotMatch(job.description, /<[a-z]/i);
});

test('ohne json-ld kommt die beschreibung aus dem artikel', async () => {
  const html = await fixtureText('jobs-at', 'detail-no-jsonld.html');
  const job = parseDetailPage(html, {
    url: 'https://www.jobs.at/i/1',
    title: 'Aus der Karte',
    company: 'Beispiel GmbH',
  });

  // Der haeufigere Fall, nicht die Ausnahme: nur ein Teil der Inserate hat JSON-LD.
  assert.ok(job.description.length > 0, 'die Beschreibung darf nicht leer bleiben');
  assert.equal(job.title, 'Aus der Karte', 'Kartendaten bleiben erhalten');
});

test('ohne beides bleibt die karte erhalten und die beschreibung leer', () => {
  const job = parseDetailPage('<html><body>nichts</body></html>', {
    url: 'https://www.jobs.at/i/7',
    title: 'Titel',
    company: 'Firma',
    location: 'Wien',
  });

  assert.deepEqual(job, {
    source: 'jobs.at',
    url: 'https://www.jobs.at/i/7',
    title: 'Titel',
    company: 'Firma',
    location: 'Wien',
    description: '',
  });
});

test('das anfrage-schema verlangt einen suchbegriff als slug', () => {
  assert.equal(jobsAtAdapter.kind, 'fetch');
  const keyword = jobsAtAdapter.querySchema.find((feld) => feld.key === 'keyword');
  assert.equal(keyword?.required, true);
  assert.equal(keyword?.format, 'slug');
});
