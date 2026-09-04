import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiCompatible } from '../llm/openai-compatible.ts';
import type { Faehigkeiten } from '../llm/provider.ts';
import { LlmFehler } from '../llm/provider.ts';
import { chatAntwort, testServer } from './helpers/http-server.ts';

const FAEHIGKEITEN: Faehigkeiten = {
  vision: true,
  jsonMode: true,
  contextBudget: 40_000,
  retryTimeoutsMs: [2_000, 2_000],
};

function faehigkeiten(ueberschreibungen: Partial<Faehigkeiten> = {}): Faehigkeiten {
  return { ...FAEHIGKEITEN, ...ueberschreibungen };
}

interface ChatKoerper {
  model: string;
  messages: { role: string; content: unknown }[];
  response_format?: { type: string };
  temperature?: number;
  max_completion_tokens?: number;
}

test('complete schickt system und nutzertext als zwei nachrichten', async (t) => {
  const server = await testServer(() => chatAntwort('Antworttext'));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'kimi',
    model: 'kimi-test',
    baseURL: server.baseURL,
    apiKey: 'schluessel-aus-env',
    faehigkeiten: faehigkeiten(),
  });

  const antwort = await provider.complete({ system: 'Du bist knapp.', user: 'Wie geht es?' });

  assert.equal(antwort, 'Antworttext');
  const koerper = server.anfragen[0]?.body as ChatKoerper;
  assert.equal(koerper.model, 'kimi-test');
  assert.deepEqual(koerper.messages[0], { role: 'system', content: 'Du bist knapp.' });
  assert.deepEqual(koerper.messages[1], { role: 'user', content: 'Wie geht es?' });
});

test('json-modus setzt response_format und laesst den system-prompt unberuehrt', async (t) => {
  const server = await testServer(() => chatAntwort('{"fit":"gut"}'));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'openai',
    model: 'test',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten({ jsonMode: true }),
  });

  const antwort = await provider.complete({ system: 'Filter.', user: 'Stelle', json: true });

  assert.equal(antwort, '{"fit":"gut"}');
  const koerper = server.anfragen[0]?.body as ChatKoerper;
  assert.equal(koerper.response_format?.type, 'json_object');
  assert.equal(koerper.messages[0]?.content, 'Filter.');
});

test('ohne json-modus wandert das schema in den system-prompt', async (t) => {
  const server = await testServer(() => chatAntwort('```json\n{"fit":"gut"}\n```'));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'altmodell',
    model: 'test',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten({ jsonMode: false }),
  });

  const antwort = await provider.complete({
    system: 'Filter.',
    user: 'Stelle',
    json: true,
    jsonSchema: { type: 'object', properties: { fit: { type: 'string' } } },
  });

  // Die Rueckfallebene muss auch die Code-Fence des Modells wieder abraeumen.
  assert.equal(antwort, '{"fit":"gut"}');
  const koerper = server.anfragen[0]?.body as ChatKoerper;
  assert.equal(koerper.response_format, undefined);
  assert.match(String(koerper.messages[0]?.content), /JSON-Schema/);
  assert.match(String(koerper.messages[0]?.content), /"fit"/);
});

test('bilder werden als data-url an den nutzertext gehaengt', async (t) => {
  const server = await testServer(() => chatAntwort('gelesen'));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'openai',
    model: 'test',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten({ vision: true }),
  });

  await provider.complete({
    system: 'Lies das Zeugnis.',
    user: 'Seite 1',
    bilder: [{ mimetype: 'image/png', base64: 'AAAA' }],
  });

  const koerper = server.anfragen[0]?.body as ChatKoerper;
  const inhalt = koerper.messages[1]?.content as { type: string; image_url?: { url: string } }[];
  assert.equal(inhalt[0]?.type, 'text');
  assert.equal(inhalt[1]?.image_url?.url, 'data:image/png;base64,AAAA');
});

test('ein anbieter ohne vision weist bilder mit klarer meldung ab', async (t) => {
  const server = await testServer(() => chatAntwort('sollte nie gerufen werden'));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'deepseek',
    model: 'deepseek-test',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten({ vision: false }),
  });

  await assert.rejects(
    () => provider.complete({ system: 's', user: 'u', bilder: [{ mimetype: 'image/png', base64: 'AAAA' }] }),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.match(fehler.message, /kann keine Bilder lesen/);
      assert.match(fehler.message, /bildfaehiges Modell/);
      return true;
    },
  );

  assert.equal(server.anfragen.length, 0, 'ohne Vision darf gar nicht erst gesendet werden');
});

test('eine leere antwort gilt als fehlversuch und wird wiederholt', async (t) => {
  let aufrufe = 0;
  const server = await testServer(() => {
    aufrufe += 1;
    return aufrufe === 1 ? chatAntwort('') : chatAntwort('endlich');
  });
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'test',
    model: 'test',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten(),
  });

  assert.equal(await provider.complete({ system: 's', user: 'u' }), 'endlich');
  assert.equal(aufrufe, 2);
});

test('modelle liefert die live-liste sortiert', async (t) => {
  const server = await testServer(() => ({
    body: {
      object: 'list',
      data: [
        { id: 'zeta-1', object: 'model' },
        { id: 'alpha-2', object: 'model' },
      ],
    },
  }));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'openrouter',
    model: 'egal',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten(),
  });

  assert.deepEqual(await provider.modelle?.(), ['alpha-2', 'zeta-1']);
  assert.equal(server.anfragen[0]?.pfad, '/v1/models');
});

test('scheitert die modellliste, bleibt die meldung handlungsleitend', async (t) => {
  const server = await testServer(() => ({ status: 404, body: { error: 'not found' } }));
  t.after(() => server.schliessen());

  const provider = createOpenAiCompatible({
    anbieter: 'hunyuan',
    model: 'egal',
    baseURL: server.baseURL,
    apiKey: 'x',
    faehigkeiten: faehigkeiten(),
  });

  await assert.rejects(() => provider.modelle?.() ?? Promise.resolve([]), /von Hand eintragen/);
});
