import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuery, describeProblem, usableQueries } from '../lib/query-schema.ts';
import type { QueryField } from '../scrapers/interface.ts';

const SCHEMA: QueryField[] = [
  { key: 'keyword', label: 'Suchbegriff', required: true, format: 'slug' },
  { key: 'location', label: 'Suchgebiet', required: false, format: 'text' },
];

test('checkQuery meldet fehlende pflichtfelder', () => {
  assert.deepEqual(checkQuery(SCHEMA, { keyword: 'entwickler' }), []);
  assert.deepEqual(checkQuery(SCHEMA, { location: 'Wien' }), [{ kind: 'missing', key: 'keyword' }]);
  assert.deepEqual(checkQuery(SCHEMA, { keyword: '   ' }), [{ kind: 'missing', key: 'keyword' }]);
});

test('checkQuery meldet unbekannte schluessel mit den erwarteten', () => {
  const probleme = checkQuery(SCHEMA, { keyword: 'entwickler', tippfehler: 'x' });

  assert.equal(probleme.length, 1);
  assert.equal(
    describeProblem(probleme[0]!),
    'unbekannter Schluessel "tippfehler" — erwartet: keyword, location',
  );
});

test('eine fehlerhafte anfrage kostet nicht den ganzen lauf', () => {
  const warnungen: string[] = [];
  const brauchbar = usableQueries(
    { name: 'testportal', querySchema: SCHEMA },
    [{ keyword: 'entwickler' }, { location: 'Wien' }, { keyword: 'tester' }],
    (nachricht) => warnungen.push(nachricht),
  );

  assert.deepEqual(brauchbar, [{ keyword: 'entwickler' }, { keyword: 'tester' }]);
  assert.equal(warnungen.length, 1);
  assert.match(warnungen[0]!, /Anfrage 2 uebersprungen/);
  assert.match(warnungen[0]!, /testportal/);
});
