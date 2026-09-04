import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogle } from '../llm/google.ts';
import type { Faehigkeiten } from '../llm/provider.ts';
import { LlmFehler } from '../llm/provider.ts';
import { testServer } from './helpers/http-server.ts';

const FAEHIGKEITEN: Faehigkeiten = {
  vision: true,
  jsonMode: true,
  contextBudget: 60_000,
  retryTimeoutsMs: [2_000, 2_000],
};

function faehigkeiten(ueberschreibungen: Partial<Faehigkeiten> = {}): Faehigkeiten {
  return { ...FAEHIGKEITEN, ...ueberschreibungen };
}

function inhaltsAntwort(text: string) {
  return {
    body: {
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    },
  };
}

interface GenerateKoerper {
  contents: { role: string; parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: { responseMimeType?: string; responseJsonSchema?: unknown; temperature?: number };
}

test('system wird als systemInstruction gesendet, nicht als teil des verlaufs', async (t) => {
  const server = await testServer(() => inhaltsAntwort('Guten Tag'));
  t.after(() => server.schliessen());

  const provider = createGoogle({
    anbieter: 'google',
    model: 'gemini-test',
    apiKey: 'schluessel-aus-env',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  assert.equal(await provider.complete({ system: 'Du schreibst knapp.', user: 'Hallo' }), 'Guten Tag');

  const koerper = server.anfragen[0]?.body as GenerateKoerper;
  assert.equal(koerper.systemInstruction?.parts[0]?.text, 'Du schreibst knapp.');
  assert.equal(koerper.contents[0]?.parts[0]?.text, 'Hallo');
});

test('json-modus setzt responseMimeType und das schema', async (t) => {
  const server = await testServer(() => inhaltsAntwort('{"fit":"gut"}'));
  t.after(() => server.schliessen());

  const provider = createGoogle({
    anbieter: 'google',
    model: 'gemini-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  const schema = { type: 'object', properties: { fit: { type: 'string' } } };
  assert.equal(
    await provider.complete({ system: 'Filter.', user: 'Stelle', json: true, jsonSchema: schema }),
    '{"fit":"gut"}',
  );

  const koerper = server.anfragen[0]?.body as GenerateKoerper;
  assert.equal(koerper.generationConfig?.responseMimeType, 'application/json');
  assert.deepEqual(koerper.generationConfig?.responseJsonSchema, schema);
});

test('bilder gehen als inlineData mit', async (t) => {
  const server = await testServer(() => inhaltsAntwort('gelesen'));
  t.after(() => server.schliessen());

  const provider = createGoogle({
    anbieter: 'google',
    model: 'gemini-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten({ vision: true }),
  });

  await provider.complete({
    system: 'Lies das Zeugnis.',
    user: 'Seite 1',
    bilder: [{ mimetype: 'image/png', base64: 'AAAA' }],
  });

  const koerper = server.anfragen[0]?.body as GenerateKoerper;
  assert.deepEqual(koerper.contents[0]?.parts[1]?.inlineData, { mimeType: 'image/png', data: 'AAAA' });
});

test('ein modell ohne vision weist bilder ab, bevor gesendet wird', async (t) => {
  const server = await testServer(() => inhaltsAntwort('sollte nie gerufen werden'));
  t.after(() => server.schliessen());

  const provider = createGoogle({
    anbieter: 'google',
    model: 'gemini-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten({ vision: false }),
  });

  await assert.rejects(
    () => provider.complete({ system: 's', user: 'u', bilder: [{ mimetype: 'image/png', base64: 'AAAA' }] }),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.match(fehler.message, /kann keine Bilder lesen/);
      return true;
    },
  );

  assert.equal(server.anfragen.length, 0);
});

test('modelle liefert die liste ohne das models/-praefix', async (t) => {
  const server = await testServer(() => ({
    body: {
      models: [
        { name: 'models/gemini-zeta', displayName: 'Zeta' },
        { name: 'models/gemini-alpha', displayName: 'Alpha' },
      ],
    },
  }));
  t.after(() => server.schliessen());

  const provider = createGoogle({
    anbieter: 'google',
    model: 'egal',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  assert.deepEqual(await provider.modelle?.(), ['gemini-alpha', 'gemini-zeta']);
});
