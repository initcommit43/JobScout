import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GedaechtnisFehler, gedaechtnisPfad, ladeGedaechtnis, speichereGedaechtnis } from '../profile/store.ts';
import { leeresGedaechtnis } from '../profile/schema.ts';
import { fixtureGedaechtnis, tmpArbeitsverzeichnis } from './helpers/fixtures.ts';

test('ohne datei liefert das laden ein leeres gedaechtnis', async (t) => {
  await tmpArbeitsverzeichnis(t);
  assert.deepEqual(await ladeGedaechtnis(), leeresGedaechtnis());
});

test('gespeichertes gedaechtnis ueberlebt einen neustart', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const gedaechtnis = fixtureGedaechtnis();

  await speichereGedaechtnis(gedaechtnis);
  assert.deepEqual(await ladeGedaechtnis(), gedaechtnis);
});

test('vor jedem ueberschreiben wird eine .bak angelegt', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const erst = fixtureGedaechtnis();
  await speichereGedaechtnis(erst);

  await speichereGedaechtnis({ ...erst, person: { ...erst.person, ort: 'Graz' } });

  const sicherung = JSON.parse(await readFile(`${gedaechtnisPfad()}.bak`, 'utf8')) as { person: { ort: string } };
  assert.equal(sicherung.person.ort, 'Wien', 'die .bak haelt den Stand vor dem Schreiben');

  const aktuell = await ladeGedaechtnis();
  assert.equal(aktuell.person.ort, 'Graz');
});

test('der erste schreibvorgang scheitert nicht an der fehlenden .bak', async (t) => {
  await tmpArbeitsverzeichnis(t);
  await assert.doesNotReject(() => speichereGedaechtnis(fixtureGedaechtnis()));
});

test('das gedaechtnis liegt unter data/, nicht unter config/', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const pfad = gedaechtnisPfad();

  assert.match(pfad, /[\\/]data[\\/]profil[\\/]gedaechtnis\.json$/);
  assert.doesNotMatch(pfad, /[\\/]config[\\/]/);
});

test('kaputtes json nennt die sicherung statt nur zu scheitern', async (t) => {
  await tmpArbeitsverzeichnis(t);
  await mkdir(path.dirname(gedaechtnisPfad()), { recursive: true });
  await writeFile(gedaechtnisPfad(), '{ kein json', 'utf8');

  await assert.rejects(() => ladeGedaechtnis(), (fehler: unknown) => {
    assert.ok(fehler instanceof GedaechtnisFehler);
    assert.match(fehler.message, /\.bak/);
    return true;
  });
});

test('ein schema-verstoss auf der platte wird beim laden gemeldet', async (t) => {
  await tmpArbeitsverzeichnis(t);
  await mkdir(path.dirname(gedaechtnisPfad()), { recursive: true });
  await writeFile(gedaechtnisPfad(), JSON.stringify({ version: 1, skills: [{ id: 'x' }] }), 'utf8');

  await assert.rejects(() => ladeGedaechtnis(), /passt nicht zum Schema/);
});

test('speichern validiert, bevor etwas auf die platte geht', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const kaputt = { ...fixtureGedaechtnis(), version: 2 } as unknown as ReturnType<typeof fixtureGedaechtnis>;

  await assert.rejects(() => speichereGedaechtnis(kaputt), /passt nicht zum Schema/);
  await assert.rejects(() => readFile(gedaechtnisPfad(), 'utf8'), /ENOENT/);
});
