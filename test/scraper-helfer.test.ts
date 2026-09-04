import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescription } from '../lib/normalize-description.ts';
import { createBatcher } from '../lib/grid-batch.ts';
import { checkQuery, describeProblem, usableQueries } from '../lib/query-schema.ts';
import { asArray, asNumber, asString, firstText, readPath } from '../lib/json-read.ts';
import type { QueryField } from '../scrapers/interface.ts';

test('normalizeDescription entfernt markup und behaelt die struktur', () => {
  const html = '<h2>Aufgaben</h2><ul><li>Wartung</li><li>Ausbau</li></ul><p>Wir freuen uns.</p>';
  const text = normalizeDescription(html);

  assert.match(text, /## Aufgaben/);
  assert.match(text, /- Wartung/);
  assert.match(text, /- Ausbau/);
  assert.doesNotMatch(text, /<[a-z]/i);
});

test('normalizeDescription wirft script und style samt inhalt weg', () => {
  const text = normalizeDescription('<script>const a = 1;</script><p>Text</p><style>p{color:red}</style>');
  assert.equal(text, 'Text');
});

test('entities werden genau einmal dekodiert', () => {
  assert.equal(normalizeDescription('Fischer &amp; Sohn'), 'Fischer & Sohn');
  // Ein zweiter Durchlauf wuerde hieraus echtes Markup machen.
  assert.equal(normalizeDescription('&lt;script&gt;'), '<script>');
  assert.equal(normalizeDescription('&amp;amp;'), '&amp;');
});

test('numerische entities werden dezimal und hexadezimal gelesen', () => {
  assert.equal(normalizeDescription('&#65;&#x42;'), 'AB');
  assert.equal(normalizeDescription('&#xZZ;'), '&#xZZ;', 'Unlesbares bleibt stehen');
});

test('ein abgeschnittenes tag am textende wird trotzdem entfernt', () => {
  assert.equal(normalizeDescription('<p>Text</p></ul'), 'Text');
});

test('mehr als zwei leerzeilen werden zusammengefasst', () => {
  assert.equal(normalizeDescription('<p>a</p><br><br><br><br><p>b</p>'), 'a\n\nb');
});

test('der batcher meldet volle bloecke und den rest beim flush', () => {
  const bloecke: number[][] = [];
  const batcher = createBatcher<number>(3, (items) => bloecke.push([...items]));

  for (const zahl of [1, 2, 3, 4, 5]) batcher.push(zahl);
  assert.deepEqual(bloecke, [[1, 2, 3]], 'der Rest wartet auf den flush');

  batcher.flush();
  assert.deepEqual(bloecke, [[1, 2, 3], [4, 5]]);
});

test('ein flush ohne inhalt meldet nichts', () => {
  let aufrufe = 0;
  const batcher = createBatcher<number>(3, () => (aufrufe += 1));

  batcher.flush();
  batcher.flush();
  assert.equal(aufrufe, 0);
});

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
  assert.equal(describeProblem(probleme[0]!), 'unbekannter Schluessel "tippfehler" — erwartet: keyword, location');
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

test('readPath geht tief und gibt bei jedem loch undefined zurueck', () => {
  const daten = { a: { b: [{ c: 'treffer' }] } };

  assert.equal(readPath(daten, 'a', 'b', 0, 'c'), 'treffer');
  assert.equal(readPath(daten, 'a', 'fehlt', 'c'), undefined);
  assert.equal(readPath(null, 'a'), undefined);
  assert.equal(readPath(undefined, 'a', 'b'), undefined);
});

test('die typ-leser geben nur den passenden typ heraus', () => {
  assert.equal(asString('text'), 'text');
  assert.equal(asString(5), undefined);
  assert.equal(asNumber(5), 5);
  assert.equal(asNumber(Number.NaN), undefined, 'NaN ist keine brauchbare Zahl');
  assert.equal(asNumber('5'), undefined);
  assert.deepEqual(asArray([1]), [1]);
  assert.deepEqual(asArray('kein array'), []);
});

test('firstText nimmt den ersten nicht leeren text', () => {
  assert.equal(firstText(undefined, '', '  ', 'Wien', 'Linz'), 'Wien');
  assert.equal(firstText(undefined, 5), undefined);
});
