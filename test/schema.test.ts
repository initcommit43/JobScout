import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GedaechtnisSchema, istBestaetigt, leeresGedaechtnis, manuelleHerkunft } from '../profile/schema.ts';
import { bestaetigt, fixtureGedaechtnis, unbestaetigt } from './helpers/fixtures.ts';

test('ein leeres gedaechtnis ist gueltig und komplett vorbelegt', () => {
  const leer = leeresGedaechtnis();

  assert.equal(leer.version, 1);
  assert.deepEqual(leer.skills, []);
  assert.equal(leer.schreibstil.absaetze, 3);
  assert.equal(leer.schreibstil.beispielAnschreiben, null);
  assert.equal(leer.praeferenzen.arbeitsmodell, 'egal');
  assert.ok(leer.schreibstil.verbotswoerter.includes('motiviert'));
});

test('das schema ueberlebt einen round-trip durch json', () => {
  const gedaechtnis = fixtureGedaechtnis();
  const zurueck = GedaechtnisSchema.parse(JSON.parse(JSON.stringify(gedaechtnis)));
  assert.deepEqual(zurueck, gedaechtnis);
});

test('unvollstaendige zeitangaben werden abgewiesen', () => {
  const kaputt = {
    ...fixtureGedaechtnis(),
    ausbildung: [
      {
        id: 'a',
        institution: 'X',
        abschluss: 'Y',
        von: '15.09.2015',
        bis: null,
        herkunft: bestaetigt(),
      },
    ],
  };

  const ergebnis = GedaechtnisSchema.safeParse(kaputt);
  assert.equal(ergebnis.success, false);
});

test('istBestaetigt trennt bestaetigte von extrahierten eintraegen', () => {
  assert.equal(istBestaetigt({ herkunft: bestaetigt() }), true);
  assert.equal(istBestaetigt({ herkunft: unbestaetigt() }), false);
});

test('handeingabe gilt sofort als bestaetigt', () => {
  const herkunft = manuelleHerkunft(new Date('2026-03-01T12:00:00.000Z'));

  assert.equal(herkunft.methode, 'manuell');
  assert.equal(herkunft.bestaetigtAm, '2026-03-01T12:00:00.000Z');
  assert.equal(istBestaetigt({ herkunft }), true);
});

test('die mitgelieferte vorlage passt zum schema', async () => {
  const roh = JSON.parse(await readFile(path.join('config', 'gedaechtnis.example.json'), 'utf8')) as unknown;
  const gedaechtnis = GedaechtnisSchema.parse(roh);

  assert.equal(gedaechtnis.person.name, 'Max Mustermann');
  assert.equal(gedaechtnis.person.email, 'bewerber@example.com');
});
