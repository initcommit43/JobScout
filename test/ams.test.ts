import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amsAdapter,
  buildLocationParam,
  buildSearchUrl,
  parseAmsResult,
  type AmsSearchResponse,
} from '../scrapers/ams.ts';
import { fixtureJson } from './helpers/fixture-datei.ts';

test('ein suchtreffer wird zur stelle mit url, firma und ort', async () => {
  const antwort = (await fixtureJson('ams', 'api-sample.json')) as AmsSearchResponse;
  const treffer = antwort.results ?? [];

  assert.ok(treffer.length > 0, 'die Fixture muss Treffer enthalten');

  const jobs = treffer.map(parseAmsResult);
  for (const job of jobs) {
    assert.equal(job.source, 'ams');
    assert.match(job.url, /^https:\/\/jobs\.ams\.at\/public\/emps\/jobs\/\d+$/);
    assert.ok(job.title.length > 0);
    assert.ok((job.location ?? '').length > 0, 'ohne Ort steht zumindest Österreich da');
    assert.doesNotMatch(job.description, /<[a-z]/i);
  }
});

test('fehlt der ort ganz, bleibt oesterreich stehen', () => {
  const job = parseAmsResult({ id: 1, title: 'Entwickler' });

  assert.equal(job.location, 'Österreich');
  assert.equal(job.company, '');
  assert.equal(job.postedAt, null);
});

test('das bundesland springt ein, wenn die gemeinde fehlt', () => {
  const job = parseAmsResult({
    id: 1,
    title: 'Entwickler',
    company: { name: 'Beispiel GmbH', address: { federalState: 'Oberösterreich' } },
  });

  assert.equal(job.location, 'Oberösterreich');
});

test('die such-url traegt suchbegriff, seite und alle stellenarten', () => {
  const url = buildSearchUrl('junior software developer', 2, '');

  assert.match(url, /query=junior%20software%20developer/);
  assert.match(url, /page=2/);
  for (const typ of ['SB_WKO', 'IJ', 'BA', 'BZ', 'TN']) {
    assert.match(url, new RegExp(`JOB_OFFER_TYPE=${typ}`), typ);
  }
});

test('der ortsparameter traegt id und radius, mit 20 km als vorgabe', () => {
  assert.equal(buildLocationParam('Linz', '4001', '40'), '&location=Linz&locationId=4001&vicinity=40');
  assert.equal(buildLocationParam('Linz', '4001'), '&location=Linz&locationId=4001&vicinity=20');
  assert.match(buildLocationParam('Sankt Pölten', '3100'), /location=Sankt%20P%C3%B6lten/);
});

test('ohne ort bleibt die url frei von ortsparametern', () => {
  const url = buildSearchUrl('entwickler', 1, '');

  assert.doesNotMatch(url, /locationId=/);
  assert.doesNotMatch(url, /vicinity=/);
});

test('ams laeuft im browser und kennt suchbegriff, ort und radius', () => {
  assert.equal(amsAdapter.kind, 'browser', 'resolveLocationId braucht den Seitenkontext');

  const felder = Object.fromEntries(amsAdapter.querySchema.map((feld) => [feld.key, feld]));
  assert.equal(felder['keyword']?.required, true);
  assert.equal(felder['keyword']?.format, 'text', 'der Wert geht woertlich in query=');
  assert.equal(felder['location']?.required, false);
  assert.equal(felder['vicinity']?.format, 'number');
});
