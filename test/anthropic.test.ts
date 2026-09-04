import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropic } from '../llm/anthropic.ts';
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

function textAntwort(text: string) {
  return {
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'test',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

function werkzeugAntwort(eingabe: unknown) {
  return {
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'test',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'antwort', input: eingabe }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

interface MessagesKoerper {
  model: string;
  system: string;
  max_tokens: number;
  messages: { role: string; content: { type: string; text?: string; source?: { data: string } }[] }[];
  tools?: { name: string; input_schema: unknown }[];
  tool_choice?: { type: string; name: string };
}

test('system bleibt vom verlauf getrennt und max_tokens ist immer gesetzt', async (t) => {
  const server = await testServer(() => textAntwort('Guten Tag'));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'claude-test',
    apiKey: 'schluessel-aus-env',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  assert.equal(await provider.complete({ system: 'Du schreibst knapp.', user: 'Hallo' }), 'Guten Tag');

  const koerper = server.anfragen[0]?.body as MessagesKoerper;
  assert.equal(koerper.system, 'Du schreibst knapp.');
  assert.equal(koerper.messages[0]?.role, 'user');
  assert.equal(koerper.messages[0]?.content[0]?.text, 'Hallo');
  assert.ok(koerper.max_tokens > 0, 'die Messages API verlangt max_tokens');
});

test('mit json-schema wird ueber einen erzwungenen werkzeugaufruf geantwortet', async (t) => {
  const server = await testServer(() => werkzeugAntwort({ fit: 'gut', grund: 'passt' }));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'claude-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  const antwort = await provider.complete({
    system: 'Filter.',
    user: 'Stelle',
    json: true,
    jsonSchema: { type: 'object', properties: { fit: { type: 'string' } } },
  });

  assert.deepEqual(JSON.parse(antwort), { fit: 'gut', grund: 'passt' });

  const koerper = server.anfragen[0]?.body as MessagesKoerper;
  assert.equal(koerper.tool_choice?.name, 'antwort');
  assert.deepEqual(koerper.tools?.[0]?.input_schema, { type: 'object', properties: { fit: { type: 'string' } } });
  // Das Schema steckt im Werkzeug, der System-Prompt bleibt unangetastet.
  assert.equal(koerper.system, 'Filter.');
});

test('json ohne schema faellt auf den system-prompt zurueck', async (t) => {
  const server = await testServer(() => textAntwort('```json\n{"fit":"gut"}\n```'));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'claude-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  assert.equal(await provider.complete({ system: 'Filter.', user: 'Stelle', json: true }), '{"fit":"gut"}');

  const koerper = server.anfragen[0]?.body as MessagesKoerper;
  assert.equal(koerper.tools, undefined);
  assert.match(koerper.system, /gueltigem JSON/);
});

test('bilder gehen als base64-block mit', async (t) => {
  const server = await testServer(() => textAntwort('gelesen'));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'claude-test',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten({ vision: true }),
  });

  await provider.complete({
    system: 'Lies das Zeugnis.',
    user: 'Seite 1',
    bilder: [{ mimetype: 'image/png', base64: 'AAAA' }],
  });

  const koerper = server.anfragen[0]?.body as MessagesKoerper;
  assert.equal(koerper.messages[0]?.content[1]?.type, 'image');
  assert.equal(koerper.messages[0]?.content[1]?.source?.data, 'AAAA');
});

test('ein modell ohne vision weist bilder ab, bevor gesendet wird', async (t) => {
  const server = await testServer(() => textAntwort('sollte nie gerufen werden'));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'claude-test',
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

test('modelle liefert die live-liste sortiert', async (t) => {
  const server = await testServer(() => ({
    body: {
      data: [
        { id: 'claude-zeta', type: 'model' },
        { id: 'claude-alpha', type: 'model' },
      ],
      has_more: false,
    },
  }));
  t.after(() => server.schliessen());

  const provider = createAnthropic({
    anbieter: 'anthropic',
    model: 'egal',
    apiKey: 'x',
    baseURL: server.origin,
    faehigkeiten: faehigkeiten(),
  });

  assert.deepEqual(await provider.modelle?.(), ['claude-alpha', 'claude-zeta']);
});
