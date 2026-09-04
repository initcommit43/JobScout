import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEinstellungen } from '../lib/einstellungen.ts';
import {
  createModellLister,
  createProviderMit,
  schluesselVorhanden,
  type FactoryUmgebung,
} from '../llm/factory.ts';
import { LlmFehler } from '../llm/provider.ts';
import { parseRegistry } from '../llm/registry.ts';

const REGISTRY = parseRegistry({
  anbieter: {
    anthropic: {
      label: 'Anthropic (Claude)',
      adapter: 'anthropic',
      envVar: 'ANTHROPIC_API_KEY',
      faehigkeiten: { vision: true, jsonMode: true, contextBudget: 60000 },
    },
    deepseek: {
      label: 'DeepSeek',
      adapter: 'openai-compatible',
      baseURL: 'https://api.deepseek.com/v1',
      envVar: 'DEEPSEEK_API_KEY',
      faehigkeiten: { vision: false, jsonMode: true, contextBudget: 40000 },
    },
    ollama: {
      label: 'Ollama (lokal)',
      adapter: 'openai-compatible',
      baseURL: 'http://localhost:11434/v1',
      faehigkeiten: { vision: false, jsonMode: true, contextBudget: 6000, retryTimeoutsMs: [600000] },
    },
  },
});

function umgebung(
  ueberschreibungen: {
    filter?: { anbieter: string; model: string };
    writer?: { anbieter: string; model: string };
    extract?: { anbieter: string; model: string };
    env?: Record<string, string | undefined>;
  } = {},
): FactoryUmgebung {
  return {
    registry: REGISTRY,
    einstellungen: parseEinstellungen({
      llm: {
        filter: ueberschreibungen.filter ?? { anbieter: 'deepseek', model: 'deepseek-chat' },
        writer: ueberschreibungen.writer ?? { anbieter: 'anthropic', model: 'claude-test' },
        extract: ueberschreibungen.extract ?? { anbieter: 'anthropic', model: 'claude-test' },
      },
    }),
    env: ueberschreibungen.env ?? { ANTHROPIC_API_KEY: 'a-key', DEEPSEEK_API_KEY: 'd-key' },
  };
}

test('waehlt je aufgabe den eingetragenen anbieter', () => {
  const u = umgebung();

  const filter = createProviderMit(u, 'filter');
  assert.equal(filter.anbieter, 'deepseek');
  assert.equal(filter.model, 'deepseek-chat');

  const writer = createProviderMit(u, 'writer');
  assert.equal(writer.anbieter, 'anthropic');
  assert.equal(writer.faehigkeiten.contextBudget, 60000);
});

test('fehlender schluessel nennt anbieter, variable und datei', () => {
  const u = umgebung({ env: { ANTHROPIC_API_KEY: 'a-key' } });

  assert.throws(
    () => createProviderMit(u, 'filter'),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.equal(fehler.anbieter, 'deepseek');
      assert.match(fehler.message, /DEEPSEEK_API_KEY/);
      assert.match(fehler.message, /\.env/);
      return true;
    },
  );
});

test('ein leerer schluessel zaehlt wie ein fehlender', () => {
  const u = umgebung({ env: { ANTHROPIC_API_KEY: 'a-key', DEEPSEEK_API_KEY: '   ' } });
  assert.throws(() => createProviderMit(u, 'filter'), /DEEPSEEK_API_KEY/);
});

test('ein lokaler anbieter ohne env-variable braucht keinen schluessel', () => {
  const u = umgebung({ filter: { anbieter: 'ollama', model: 'irgendein-modell' }, env: {} });
  const provider = createProviderMit(u, 'filter');

  assert.equal(provider.anbieter, 'ollama');
  assert.deepEqual(provider.faehigkeiten.retryTimeoutsMs, [600000], 'lokale Modelle brauchen Minuten');
});

test('unbekannter anbieter listet die eingetragenen auf', () => {
  const u = umgebung({ writer: { anbieter: 'tippfehler', model: 'x' } });

  assert.throws(
    () => createProviderMit(u, 'writer'),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.match(fehler.message, /anthropic, deepseek, ollama/);
      return true;
    },
  );
});

test('fehlende modell-id verweist auf die einstellungen', () => {
  const u = umgebung({ writer: { anbieter: 'anthropic', model: '' } });
  assert.throws(() => createProviderMit(u, 'writer'), /llm\.writer\.model/);
});

test('vision-anforderung an einem modell ohne vision wird verweigert', () => {
  const u = umgebung({ extract: { anbieter: 'deepseek', model: 'deepseek-chat' } });

  assert.throws(
    () => createProviderMit(u, 'extract', { vision: true }),
    (fehler: unknown) => {
      assert.ok(fehler instanceof LlmFehler);
      assert.match(fehler.message, /bildfaehiges Modell/);
      assert.match(fehler.message, /DeepSeek/);
      return true;
    },
  );

  // Ohne die Anforderung bleibt derselbe Anbieter nutzbar.
  assert.doesNotThrow(() => createProviderMit(u, 'extract'));
});

test('schluesselVorhanden meldet nur das vorhandensein', () => {
  const u = umgebung({ env: { ANTHROPIC_API_KEY: 'a-key', DEEPSEEK_API_KEY: '' } });

  assert.equal(schluesselVorhanden(u, 'anthropic'), true);
  assert.equal(schluesselVorhanden(u, 'deepseek'), false);
  assert.equal(schluesselVorhanden(u, 'ollama'), true, 'ohne envVar ist nichts zu hinterlegen');
});

test('der modell-lister kommt ohne eingetragene modell-id aus', () => {
  const provider = createModellLister(umgebung(), 'anthropic');

  assert.equal(provider.model, '');
  assert.equal(typeof provider.modelle, 'function');
});
