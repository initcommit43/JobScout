import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescription } from '../lib/normalize-description.ts';

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
