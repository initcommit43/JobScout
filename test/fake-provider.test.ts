import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeProvider } from './helpers/fake-provider.ts';

test('fakeProvider liefert die hinterlegten antworten der reihe nach', async () => {
  const provider = fakeProvider(['erste', 'zweite']);

  assert.equal(await provider.complete({ system: 's', user: 'a' }), 'erste');
  assert.equal(await provider.complete({ system: 's', user: 'b' }), 'zweite');
  assert.equal(provider.anzahlAufrufe, 2);
  assert.equal(provider.aufrufe[1]?.user, 'b');
});

test('fakeProvider wirft hinterlegte fehler statt sie zu liefern', async () => {
  const provider = fakeProvider([new Error('kaputt')]);
  await assert.rejects(() => provider.complete({ system: 's', user: 'a' }), /kaputt/);
});
