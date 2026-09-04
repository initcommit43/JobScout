import { randomUUID } from 'node:crypto';
import type { Ausbildung, Entitaet, Erfahrung, Gedaechtnis, Herkunft, Projekt, Skill, Zertifikat } from './schema.ts';
import { SKILL_NIVEAUS } from './schema.ts';

/**
 * Merging must never lose data. A second import is normal — a new reference, an updated
 * CV — and it may only add or enrich. Where both sides claim a different value the
 * conflict is reported for the UI rather than silently decided: guessing wrong here
 * puts a false statement into a real application.
 */

export type Kandidaten = Partial<Pick<Gedaechtnis, Entitaet>>;

export interface Konflikt {
  entitaet: Entitaet;
  id: string;
  /** Human-readable, so the UI can show which entry is meant. */
  bezeichnung: string;
  feld: string;
  bestehend: string;
  neu: string;
}

export interface MergeErgebnis {
  gedaechtnis: Gedaechtnis;
  konflikte: Konflikt[];
  hinzugefuegt: Record<Entitaet, number>;
  zusammengefuehrt: Record<Entitaet, number>;
}

/**
 * Short forms people actually write in CVs. Kept small on purpose — a long list starts
 * merging things that only look alike.
 */
const SKILL_SYNONYME: Readonly<Record<string, string>> = {
  js: 'javascript',
  ecmascript: 'javascript',
  ts: 'typescript',
  node: 'nodejs',
  'react.js': 'react',
  reactjs: 'react',
  vuejs: 'vue',
  py: 'python',
  postgres: 'postgresql',
  psql: 'postgresql',
  k8s: 'kubernetes',
  'c#': 'csharp',
  'c++': 'cpp',
  ci: 'cicd',
  cicd: 'cicd',
};

export function normalisiereSkill(name: string): string {
  const roh = name
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#.]/g, '');

  // Erst die Schreibweise mit Punkt nachschlagen (react.js), dann ohne (nodejs).
  const ohnePunkt = roh.replace(/\./g, '');
  return SKILL_SYNONYME[roh] ?? SKILL_SYNONYME[ohnePunkt] ?? ohnePunkt;
}

export function normalisiereName(wert: string): string {
  return wert
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Months since year 0, so 'YYYY' and 'YYYY-MM' compare against each other. */
function alsMonat(zeitpunkt: string, alsEnde: boolean): number {
  const [jahr, monat] = zeitpunkt.split('-');
  const j = Number(jahr);
  if (monat === undefined) return alsEnde ? j * 12 + 11 : j * 12;
  return j * 12 + (Number(monat) - 1);
}

export function zeitraumUeberlappt(
  a: { von: string; bis: string | null },
  b: { von: string; bis: string | null },
): boolean {
  const aVon = alsMonat(a.von, false);
  const aBis = a.bis === null ? Number.POSITIVE_INFINITY : alsMonat(a.bis, true);
  const bVon = alsMonat(b.von, false);
  const bBis = b.bis === null ? Number.POSITIVE_INFINITY : alsMonat(b.bis, true);
  return aVon <= bBis && bVon <= aBis;
}

function niveauRang(niveau: string | undefined): number {
  return niveau === undefined ? -1 : SKILL_NIVEAUS.indexOf(niveau as (typeof SKILL_NIVEAUS)[number]);
}

/** Confirmed provenance beats unconfirmed; otherwise the existing one stands. */
function bessereHerkunft(bestehend: Herkunft, neu: Herkunft): Herkunft {
  if (bestehend.bestaetigtAm === null && neu.bestaetigtAm !== null) return neu;
  return bestehend;
}

function vereinige(a: readonly string[], b: readonly string[]): string[] {
  const gesehen = new Map<string, string>();
  for (const wert of [...a, ...b]) {
    const schluessel = normalisiereName(wert);
    if (schluessel !== '' && !gesehen.has(schluessel)) gesehen.set(schluessel, wert);
  }
  return [...gesehen.values()];
}

interface Sammler {
  konflikte: Konflikt[];
  entitaet: Entitaet;
  id: string;
  bezeichnung: string;
}

/**
 * Takes the new value only where nothing was there before. Two different filled values
 * are a conflict — the existing one stays until a human decides.
 */
function feldwert<T extends string | number | null | undefined>(
  sammler: Sammler,
  feld: string,
  bestehend: T,
  neu: T,
): T {
  const bestehendLeer = bestehend === undefined || bestehend === null || bestehend === '';
  const neuLeer = neu === undefined || neu === null || neu === '';

  if (bestehendLeer) return neuLeer ? bestehend : neu;
  if (neuLeer || bestehend === neu) return bestehend;

  sammler.konflikte.push({
    entitaet: sammler.entitaet,
    id: sammler.id,
    bezeichnung: sammler.bezeichnung,
    feld,
    bestehend: String(bestehend),
    neu: String(neu),
  });
  return bestehend;
}

type Verschmelzer<T> = (bestehend: T, neu: T, sammler: Sammler) => T;

function verschmelzeListe<T extends { id: string; herkunft: Herkunft }>(
  entitaet: Entitaet,
  bestehende: readonly T[],
  neue: readonly T[],
  passt: (a: T, b: T) => boolean,
  bezeichne: (eintrag: T) => string,
  verschmelze: Verschmelzer<T>,
  konflikte: Konflikt[],
): { liste: T[]; hinzugefuegt: number; zusammengefuehrt: number } {
  const liste = [...bestehende];
  const vergebeneIds = new Set(liste.map((eintrag) => eintrag.id));
  let hinzugefuegt = 0;
  let zusammengefuehrt = 0;

  for (const kandidat of neue) {
    const index = liste.findIndex((vorhanden) => passt(vorhanden, kandidat));

    if (index === -1) {
      // Eine kollidierende ID waere ein stiller Datenverlust beim naechsten Zugriff.
      const id = vergebeneIds.has(kandidat.id) ? randomUUID() : kandidat.id;
      vergebeneIds.add(id);
      liste.push({ ...kandidat, id });
      hinzugefuegt += 1;
      continue;
    }

    const vorhanden = liste[index] as T;
    const sammler: Sammler = { konflikte, entitaet, id: vorhanden.id, bezeichnung: bezeichne(vorhanden) };
    liste[index] = verschmelze(vorhanden, kandidat, sammler);
    zusammengefuehrt += 1;
  }

  return { liste, hinzugefuegt, zusammengefuehrt };
}

export function mergeGedaechtnis(basis: Gedaechtnis, kandidaten: Kandidaten): MergeErgebnis {
  const konflikte: Konflikt[] = [];
  const hinzugefuegt: Record<Entitaet, number> = {
    ausbildung: 0,
    berufserfahrung: 0,
    skills: 0,
    zertifikate: 0,
    projekte: 0,
  };
  const zusammengefuehrt: Record<Entitaet, number> = { ...hinzugefuegt };

  const ausbildung = verschmelzeListe<Ausbildung>(
    'ausbildung',
    basis.ausbildung,
    kandidaten.ausbildung ?? [],
    (a, b) => normalisiereName(a.institution) === normalisiereName(b.institution) && zeitraumUeberlappt(a, b),
    (eintrag) => `${eintrag.institution} — ${eintrag.abschluss}`,
    (bestehend, neu, sammler) => ({
      ...bestehend,
      abschluss: feldwert(sammler, 'abschluss', bestehend.abschluss, neu.abschluss),
      fachrichtung: feldwert(sammler, 'fachrichtung', bestehend.fachrichtung, neu.fachrichtung),
      note: feldwert(sammler, 'note', bestehend.note, neu.note),
      bis: feldwert(sammler, 'bis', bestehend.bis, neu.bis),
      herkunft: bessereHerkunft(bestehend.herkunft, neu.herkunft),
    }),
    konflikte,
  );

  const berufserfahrung = verschmelzeListe<Erfahrung>(
    'berufserfahrung',
    basis.berufserfahrung,
    kandidaten.berufserfahrung ?? [],
    (a, b) => normalisiereName(a.firma) === normalisiereName(b.firma) && zeitraumUeberlappt(a, b),
    (eintrag) => `${eintrag.firma} — ${eintrag.position}`,
    (bestehend, neu, sammler) => ({
      ...bestehend,
      position: feldwert(sammler, 'position', bestehend.position, neu.position),
      bis: feldwert(sammler, 'bis', bestehend.bis, neu.bis),
      taetigkeiten: vereinige(bestehend.taetigkeiten, neu.taetigkeiten),
      technologien: vereinige(bestehend.technologien, neu.technologien),
      herkunft: bessereHerkunft(bestehend.herkunft, neu.herkunft),
    }),
    konflikte,
  );

  const skills = verschmelzeListe<Skill>(
    'skills',
    basis.skills,
    kandidaten.skills ?? [],
    (a, b) => normalisiereSkill(a.name) === normalisiereSkill(b.name),
    (eintrag) => eintrag.name,
    (bestehend, neu) => ({
      ...bestehend,
      // Das hoehere Niveau gewinnt, statt einen Konflikt zu melden: zwei Belege fuer
      // dieselbe Faehigkeit widersprechen sich nicht, der spaetere ist der bessere.
      niveau: niveauRang(neu.niveau) > niveauRang(bestehend.niveau) ? neu.niveau : bestehend.niveau,
      belegIds: vereinige(bestehend.belegIds, neu.belegIds),
      herkunft: bessereHerkunft(bestehend.herkunft, neu.herkunft),
    }),
    konflikte,
  );

  const zertifikate = verschmelzeListe<Zertifikat>(
    'zertifikate',
    basis.zertifikate,
    kandidaten.zertifikate ?? [],
    (a, b) =>
      normalisiereName(a.name) === normalisiereName(b.name) &&
      normalisiereName(a.aussteller) === normalisiereName(b.aussteller),
    (eintrag) => `${eintrag.name} (${eintrag.aussteller})`,
    (bestehend, neu, sammler) => ({
      ...bestehend,
      ausgestelltAm: feldwert(sammler, 'ausgestelltAm', bestehend.ausgestelltAm, neu.ausgestelltAm),
      gueltigBis: feldwert(sammler, 'gueltigBis', bestehend.gueltigBis, neu.gueltigBis),
      nachweisId: feldwert(sammler, 'nachweisId', bestehend.nachweisId, neu.nachweisId),
      herkunft: bessereHerkunft(bestehend.herkunft, neu.herkunft),
    }),
    konflikte,
  );

  const projekte = verschmelzeListe<Projekt>(
    'projekte',
    basis.projekte,
    kandidaten.projekte ?? [],
    (a, b) => normalisiereName(a.name) === normalisiereName(b.name),
    (eintrag) => eintrag.name,
    (bestehend, neu, sammler) => ({
      ...bestehend,
      beschreibung: feldwert(sammler, 'beschreibung', bestehend.beschreibung, neu.beschreibung),
      rolle: feldwert(sammler, 'rolle', bestehend.rolle, neu.rolle),
      url: feldwert(sammler, 'url', bestehend.url, neu.url),
      technologien: vereinige(bestehend.technologien, neu.technologien),
      anchor: bestehend.anchor || neu.anchor,
      herkunft: bessereHerkunft(bestehend.herkunft, neu.herkunft),
    }),
    konflikte,
  );

  hinzugefuegt.ausbildung = ausbildung.hinzugefuegt;
  hinzugefuegt.berufserfahrung = berufserfahrung.hinzugefuegt;
  hinzugefuegt.skills = skills.hinzugefuegt;
  hinzugefuegt.zertifikate = zertifikate.hinzugefuegt;
  hinzugefuegt.projekte = projekte.hinzugefuegt;

  zusammengefuehrt.ausbildung = ausbildung.zusammengefuehrt;
  zusammengefuehrt.berufserfahrung = berufserfahrung.zusammengefuehrt;
  zusammengefuehrt.skills = skills.zusammengefuehrt;
  zusammengefuehrt.zertifikate = zertifikate.zusammengefuehrt;
  zusammengefuehrt.projekte = projekte.zusammengefuehrt;

  return {
    gedaechtnis: {
      ...basis,
      ausbildung: ausbildung.liste,
      berufserfahrung: berufserfahrung.liste,
      skills: skills.liste,
      zertifikate: zertifikate.liste,
      projekte: projekte.liste,
    },
    konflikte,
    hinzugefuegt,
    zusammengefuehrt,
  };
}
