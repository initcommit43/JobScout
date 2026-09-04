import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrahiereJson,
  LlmFehler,
  mitWiederholung,
  systemMitSchema,
  versuchsSignal,
} from '../llm/provider.ts';
import { fakeProvider } from './helpers/fake-provider.ts';

test('extrahiereJson nimmt sauberes json unveraendert', () => {
  assert.equal(extrahiereJson('{"a":1}'), '{"a":1}');
  assert.equal(extrahiereJson('  [1,2]  '), '[1,2]');
});

test('extrahiereJson entfernt code-fences', () => {
  assert.equal(extrahiereJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extrahiereJson('```\n{"a":1}\n```'), '{"a":1}');
});

test('extrahiereJson schneidet umgebenden fliesstext weg', () => {
  const antwort = 'Gerne! Hier das Ergebnis:\n{"treffer": true}\nIch hoffe, das passt.';
  assert.equal(extrahiereJson(antwort), '{"treffer": true}');
});

test('extrahiereJson findet auch ein array im fliesstext', () => {
  assert.equal(extrahiereJson('Ergebnis: [{"a":1}] fertig'), '[{"a":1}]');
});

test('extrahiereJson gibt bei fehlendem json den text zurueck', () => {
  assert.equal(extrahiereJson('kein json hier'), 'kein json hier');
});

test('systemMitSchema haengt das schema an den system-prompt', () => {
  const mitSchema = systemMitSchema('Du bist ein Filter.', { type: 'object' });
  assert.match(mitSchema, /^Du bist ein Filter\./);
  assert.match(mitSchema, /"type":"object"/);

  const ohneSchema = systemMitSchema('Du bist ein Filter.');
  assert.match(ohneSchema, /gueltigem JSON/);
});

test('versuchsSignal bricht ab, sobald der aufrufer abbricht', () => {
  const controller = new AbortController();
  const signal = versuchsSignal(60_000, controller.signal);
  assert.equal(signal.aborted, false);
  controller.abort();
  assert.equal(signal.aborted, true);
});

test('mitWiederholung liefert das ergebnis des ersten erfolgreichen versuchs', async () => {
  let versuche = 0;
  const ergebnis = await mitWiederholung('test', [50, 50], undefined, () => {
    versuche += 1;
    return versuche === 1 ? Promise.reject(new Error('netz weg')) : Promise.resolve('ok');
  });

  assert.equal(ergebnis, 'ok');
  assert.equal(versuche, 2);
});

test('mitWiederholung gibt nach dem letzten versuch auf und nennt den grund', async () => {
  let versuche = 0;
  await assert.rejects(
    () =>
      mitWiederholung('kimi', [20, 20], undefined, () => {
        versuche += 1;
        return Promise.reject(new Error('502 bad gateway'));
      }),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.equal(fehler.anbieter, 'kimi');
      assert.match(fehler.message, /nach 2 Versuchen/);
      assert.match(fehler.message, /502 bad gateway/);
      return true;
    },
  );
  assert.equal(versuche, 2);
});

test('mitWiederholung wiederholt einen abbruch des nutzers nicht', async () => {
  const controller = new AbortController();
  let versuche = 0;

  await assert.rejects(
    () =>
      mitWiederholung('test', [20, 20, 20], controller.signal, () => {
        versuche += 1;
        controller.abort();
        return Promise.reject(new Error('abgebrochen'));
      }),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.match(fehler.message, /abgebrochen/);
      return true;
    },
  );

  assert.equal(versuche, 1, 'nach einem Abbruch darf kein weiterer Versuch folgen');
});

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
