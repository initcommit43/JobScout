import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobBasename, searchSlug, slugify } from '../lib/slugify.ts';

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
  const name = jobBasename({
    title: 'Junior Softwareentwickler (m/w/d)',
    company: 'Beispiel GmbH',
    postedAt: '2026-03-01',
    scrapedAt: '2026-03-02T08:00:00.000Z',
    id: 'abcdef1234567890',
  });

  assert.equal(name, 'junior-softwareentwickler-m-w-d_beispiel-gmbh_2026-03-01_abcdef12');
  assert.notEqual(name, 'abcdef1234567890', 'die Datei heisst nie einfach nach der ID');
});

test('ohne postedAt datiert der dateiname nach dem scrape', () => {
  const name = jobBasename({
    title: 'Entwickler',
    company: 'Beispiel GmbH',
    postedAt: null,
    scrapedAt: '2026-04-05T09:00:00.000Z',
    id: 'abcdef1234567890',
  });

  assert.match(name, /_2026-04-05_/);
});
