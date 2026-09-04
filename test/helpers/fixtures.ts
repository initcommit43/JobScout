import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Gedaechtnis, Herkunft } from '../../profile/schema.ts';
import { GedaechtnisSchema } from '../../profile/schema.ts';

/**
 * An isolated working directory. Since every path in this project resolves against
 * cwd, switching cwd is also what keeps a test from touching the real data/.
 */
export async function tmpArbeitsverzeichnis(t: TestContext): Promise<string> {
  const verzeichnis = await mkdtemp(path.join(tmpdir(), 'bewerbungsbot-'));
  const vorher = process.cwd();
  process.chdir(verzeichnis);

  t.after(async () => {
    process.chdir(vorher);
    await rm(verzeichnis, { recursive: true, force: true });
  });

  return verzeichnis;
}

export function bestaetigt(zeitpunkt = '2026-01-15T10:00:00.000Z'): Herkunft {
  return { methode: 'manuell', bestaetigtAm: zeitpunkt };
}

export function unbestaetigt(zitat = 'Textstelle aus dem Lebenslauf'): Herkunft {
  return { methode: 'extrahiert', dokumentId: 'dok-1', seite: 1, zitat, bestaetigtAm: null };
}

/** Artificial person throughout — no real name, no real address. */
export function fixtureGedaechtnis(ueberschreibungen: Partial<Gedaechtnis> = {}): Gedaechtnis {
  return GedaechtnisSchema.parse({
    version: 1,
    person: { name: 'Max Mustermann', email: 'bewerber@example.com', ort: 'Wien' },
    ausbildung: [
      {
        id: 'ausb-1',
        institution: 'HTL Musterstadt',
        abschluss: 'Matura',
        fachrichtung: 'Informatik',
        von: '2015-09',
        bis: '2020-06',
        herkunft: bestaetigt(),
      },
    ],
    berufserfahrung: [
      {
        id: 'erf-1',
        firma: 'Beispiel GmbH',
        position: 'Softwareentwickler',
        von: '2020-09',
        bis: null,
        taetigkeiten: ['Wartung einer Bestellplattform'],
        technologien: ['TypeScript', 'PostgreSQL'],
        herkunft: bestaetigt(),
      },
    ],
    skills: [
      {
        id: 'skill-1',
        name: 'TypeScript',
        kategorie: 'sprache',
        niveau: 'fortgeschritten',
        belegIds: ['erf-1'],
        herkunft: bestaetigt(),
      },
    ],
    projekte: [
      {
        id: 'proj-1',
        name: 'Bestellplattform',
        beschreibung: 'Altsystem in Etappen abgeloest.',
        technologien: ['TypeScript'],
        anchor: true,
        herkunft: bestaetigt(),
      },
    ],
    ...ueberschreibungen,
  });
}
