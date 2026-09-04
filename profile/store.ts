import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataPfad } from '../lib/pfade.ts';
import type { Gedaechtnis } from './schema.ts';
import { GedaechtnisSchema, leeresGedaechtnis } from './schema.ts';

/**
 * The memory lives under data/ — gitignored — because it carries the real name,
 * address and phone number. config/ is tracked and is the wrong place for it.
 */
export function gedaechtnisPfad(): string {
  return dataPfad('profil', 'gedaechtnis.json');
}

export class GedaechtnisFehler extends Error {
  constructor(nachricht: string, options?: { cause?: unknown }) {
    super(nachricht, options);
    this.name = 'GedaechtnisFehler';
  }
}

/** Hook for future schema versions; today there is only version 1. */
type Migration = (roh: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONEN = new Map<number, Migration>();

export async function ladeGedaechtnis(): Promise<Gedaechtnis> {
  let roh: string;
  try {
    roh = await readFile(gedaechtnisPfad(), 'utf8');
  } catch (fehler) {
    if (istNichtGefunden(fehler)) return leeresGedaechtnis();
    throw fehler;
  }

  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch (fehler) {
    throw new GedaechtnisFehler(
      `${gedaechtnisPfad()} ist kein gueltiges JSON. Die letzte gute Fassung liegt daneben als .bak.`,
      { cause: fehler },
    );
  }

  return parseGedaechtnis(migriere(daten));
}

export function parseGedaechtnis(roh: unknown): Gedaechtnis {
  const ergebnis = GedaechtnisSchema.safeParse(roh);
  if (!ergebnis.success) {
    const stellen = ergebnis.error.issues
      .map((problem) => `${problem.path.join('.')}: ${problem.message}`)
      .join('; ');
    throw new GedaechtnisFehler(`Das Bewerbungsgedaechtnis passt nicht zum Schema — ${stellen}`);
  }
  return ergebnis.data;
}

/**
 * Backup first, then temp file, then rename. The backup is what makes a bad merge or a
 * crashed extraction recoverable; the rename is what keeps a half-written file from
 * ever being the one on disk.
 */
export async function speichereGedaechtnis(gedaechtnis: Gedaechtnis): Promise<void> {
  const geprueft = parseGedaechtnis(gedaechtnis);
  const ziel = gedaechtnisPfad();
  await mkdir(path.dirname(ziel), { recursive: true });

  try {
    await copyFile(ziel, `${ziel}.bak`);
  } catch (fehler) {
    if (!istNichtGefunden(fehler)) throw fehler; // erster Schreibvorgang, es gibt noch nichts zu sichern
  }

  const temp = `${ziel}.${String(process.pid)}.tmp`;
  await writeFile(temp, `${JSON.stringify(geprueft, null, 2)}\n`, 'utf8');
  await rename(temp, ziel);
}

function migriere(daten: unknown): unknown {
  if (typeof daten !== 'object' || daten === null) return daten;

  let aktuell = daten as Record<string, unknown>;
  let sicherung = 0;

  while (typeof aktuell['version'] === 'number') {
    const migration = MIGRATIONEN.get(aktuell['version']);
    if (migration === undefined) break;
    aktuell = migration(aktuell);
    if (++sicherung > MIGRATIONEN.size) {
      throw new GedaechtnisFehler('Die Migration des Gedaechtnisses laeuft im Kreis.');
    }
  }

  return aktuell;
}

function istNichtGefunden(fehler: unknown): boolean {
  return fehler instanceof Error && 'code' in fehler && fehler.code === 'ENOENT';
}
