import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEinstellungen } from '../lib/einstellungen.ts';
import { configPfad } from '../lib/pfade.ts';
import { parseRegistry } from '../llm/registry.ts';

// Die Vorlagen laufen sonst still vom Schema weg. Hier werden sie dagegen validiert.

test('die mitgelieferte registry-vorlage ist gueltig', async () => {
  const roh = JSON.parse(await readFile(configPfad('anbieter.example.json'), 'utf8')) as unknown;
  const registry = parseRegistry(roh);

  assert.ok(Object.keys(registry.anbieter).length >= 10);
  for (const [name, eintrag] of Object.entries(registry.anbieter)) {
    if (eintrag.adapter === 'openai-compatible') {
      assert.ok(eintrag.baseURL !== undefined, `${name} braucht eine baseURL`);
    }
  }
});

test('die mitgelieferte einstellungs-vorlage ist gueltig und sendet nicht von selbst', async () => {
  const roh = JSON.parse(await readFile(configPfad('settings.example.json'), 'utf8')) as unknown;
  const einstellungen = parseEinstellungen(roh);

  assert.equal(einstellungen.sendMode, 'entwurf', 'ein frisches Repo darf nichts versehentlich senden');
  for (const anbieter of Object.values(einstellungen.llm)) {
    assert.ok(anbieter.anbieter.length > 0, 'jede Aufgabe braucht einen Anbieter');
  }
});

test('die vorlagen enthalten keinen schluessel', async () => {
  for (const datei of ['anbieter.example.json', 'settings.example.json']) {
    const inhalt = await readFile(configPfad(datei), 'utf8');
    assert.doesNotMatch(inhalt, /"apiKey"/, `${datei} darf kein Schluesselfeld haben`);
    assert.doesNotMatch(inhalt, /sk-[A-Za-z0-9_-]{16,}/, `${datei} darf keinen Schluessel enthalten`);
  }
});
