import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asArray, asNumber, asString, firstText, readPath } from '../lib/json-read.ts';

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
