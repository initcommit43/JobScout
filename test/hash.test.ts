import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobId } from '../lib/hash.ts';
import { jobBasename, searchSlug, slugify } from '../lib/slugify.ts';
import { toJob } from '../lib/normalize.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';

test('dieselbe stelle ergibt dieselbe id', () => {
  const a = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  const b = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test('geschlechtsmarker im titel aendern die id nicht', () => {
  const ohne = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  for (const titel of [
    'Softwareentwickler (m/w/d)',
    'Softwareentwickler m/f/x',
    'Softwareentwickler:in',
    'Softwareentwickler*in',
  ]) {
    assert.equal(jobId({ title: titel, company: 'Beispiel GmbH' }), ohne, titel);
  }
});

test('ein wort, das nur auf -in endet, bleibt unangetastet', () => {
  assert.notEqual(
    jobId({ title: 'Marketing', company: 'Beispiel GmbH' }),
    jobId({ title: 'Market', company: 'Beispiel GmbH' }),
  );
});

test('unterschiedliche satzzeichen ergeben dieselbe id', () => {
  // Echter Fall: karriere.at fuehrte "… (m/w/d) – 1st Level", jobs.at dieselbe Stelle
  // ohne Gedankenstrich. Nur Leerzeichen zu kollabieren liess zwei IDs stehen.
  assert.equal(
    jobId({ title: 'Technical Support Engineer (m/w/d) – 1st Level', company: 'Beispiel GmbH' }),
    jobId({ title: 'Technical Support Engineer 1st Level', company: 'Beispiel GmbH' }),
  );
});

test('rechtsformen im firmennamen aendern die id nicht', () => {
  const basis = jobId({ title: 'Entwickler', company: 'Beispiel' });
  for (const firma of ['Beispiel GmbH', 'Beispiel GmbH & Co KG', 'Beispiel AG', 'Beispiel e.U.']) {
    assert.equal(jobId({ title: 'Entwickler', company: firma }), basis, firma);
  }
});

test('umlaute und scharfes s im firmennamen aendern die id nicht', () => {
  // Fuer die ID werden Diakritika entfernt (ue -> u), waehrend slugify sie ausschreibt
  // (ue -> ue). Verschiedene Zwecke: hier zaehlt nur, dass beide Schreibweisen einer
  // Firma dieselbe ID ergeben.
  assert.equal(
    jobId({ title: 'Entwickler', company: 'Grüße GmbH' }),
    jobId({ title: 'Entwickler', company: 'Grusse' }),
  );
});

test('verschiedene stellen ergeben verschiedene ids', () => {
  assert.notEqual(
    jobId({ title: 'Entwickler', company: 'Beispiel GmbH' }),
    jobId({ title: 'Entwickler', company: 'Andere GmbH' }),
  );
});

test('titel und firma lassen sich nicht ineinanderschieben', () => {
  assert.notEqual(
    jobId({ title: 'ab', company: 'c' }),
    jobId({ title: 'a', company: 'bc' }),
  );
});

test('slugify kuerzt fuer dateinamen, searchSlug nicht', () => {
  const lang = 'junior fullstack javascript typescript entwickler';

  assert.ok(slugify(lang).length <= 40);
  assert.doesNotMatch(slugify(lang), /-$/, 'kein haengender Bindestrich nach dem Kuerzen');
  assert.equal(searchSlug(lang), 'junior-fullstack-javascript-typescript-entwickler');
});

test('beide slug-funktionen schreiben umlaute aus', () => {
  assert.equal(searchSlug('Bürokauffrau'), 'buerokauffrau');
  assert.equal(searchSlug('Straße'), 'strasse');
});

test('der dateiname traegt titel, firma, datum und id-praefix', () => {
  const job = toJob(fixtureScrapedJob());
  const name = jobBasename(job);

  assert.match(name, /^junior-softwareentwickler-m-w-d_beispiel-gmbh_2026-03-01_[0-9a-f]{8}$/);
  assert.notEqual(name, job.id, 'die Datei heisst nie einfach nach der ID');
});

test('ohne postedAt datiert der dateiname nach dem scrape', () => {
  const job = { ...toJob(fixtureScrapedJob({ postedAt: null })), scrapedAt: '2026-04-05T09:00:00.000Z' };
  assert.match(jobBasename(job), /_2026-04-05_/);
});

test('toJob setzt status new und beide zeitstempel', () => {
  const job = toJob(fixtureScrapedJob());

  assert.equal(job.status, 'new');
  assert.equal(job.fit, null);
  assert.equal(job.scrapedAt, job.updatedAt);
  assert.equal(job.id, jobId(fixtureScrapedJob()));
});
