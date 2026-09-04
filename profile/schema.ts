import { z } from 'zod';

/**
 * The single source of truth about the shape of the application memory. The TypeScript
 * type, the JSON schema used for extraction and the form fields in the UI are all
 * derived from here — adding a field is one change, not three.
 */

/**
 * Provenance. Hangs off EVERY entry. Without `bestaetigtAm` an entry never reaches a
 * cover letter: that is the hallucination brake. An extraction mistake has to survive
 * a human look before it can end up in a real application.
 */
export const HerkunftSchema = z.object({
  methode: z.enum(['extrahiert', 'manuell']),
  dokumentId: z.string().optional(),
  seite: z.number().int().positive().optional(),
  /** Verbatim source text, shown next to the candidate during review. */
  zitat: z.string().max(500).optional(),
  bestaetigtAm: z.iso.datetime().nullable(),
});

/** 'YYYY' or 'YYYY-MM'; CVs rarely name the day and inventing one would be a lie. */
const Zeitpunkt = z.string().regex(/^\d{4}(-\d{2})?$/, 'Erwartet wird YYYY oder YYYY-MM');

export const AusbildungSchema = z.object({
  id: z.string().min(1),
  institution: z.string().min(1),
  abschluss: z.string().min(1),
  fachrichtung: z.string().optional(),
  von: Zeitpunkt,
  /** null bedeutet laufend. */
  bis: Zeitpunkt.nullable(),
  note: z.string().optional(),
  herkunft: HerkunftSchema,
});

export const ErfahrungSchema = z.object({
  id: z.string().min(1),
  firma: z.string().min(1),
  position: z.string().min(1),
  von: Zeitpunkt,
  bis: Zeitpunkt.nullable(),
  taetigkeiten: z.array(z.string()).default([]),
  technologien: z.array(z.string()).default([]),
  herkunft: HerkunftSchema,
});

export const SKILL_KATEGORIEN = [
  'sprache',
  'frontend',
  'backend',
  'datenbank',
  'devops',
  'tool',
  'methode',
  'sonstiges',
] as const;

export const SKILL_NIVEAUS = ['grundkenntnisse', 'fortgeschritten', 'sicher', 'experte'] as const;

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kategorie: z.enum(SKILL_KATEGORIEN),
  niveau: z.enum(SKILL_NIVEAUS).optional(),
  /** Points at Erfahrung/Projekt ids — a skill without evidence is a claim. */
  belegIds: z.array(z.string()).default([]),
  herkunft: HerkunftSchema,
});

export const ZertifikatSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aussteller: z.string().min(1),
  ausgestelltAm: Zeitpunkt,
  gueltigBis: Zeitpunkt.nullable(),
  nachweisId: z.string().optional(),
  herkunft: HerkunftSchema,
});

export const ProjektSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  beschreibung: z.string().default(''),
  technologien: z.array(z.string()).default([]),
  rolle: z.string().optional(),
  url: z.url().optional(),
  /** Preferred in cover letters, before any relevance ranking. */
  anchor: z.boolean().default(false),
  herkunft: HerkunftSchema,
});

export const SPRACH_NIVEAUS = ['Muttersprache', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const;

export const SprachkenntnisSchema = z.object({
  sprache: z.string().min(1),
  niveau: z.enum(SPRACH_NIVEAUS),
});

export const PraeferenzenSchema = z.object({
  wunschpositionen: z.array(z.string()).default([]),
  orte: z.array(z.string()).default([]),
  gehaltMinimum: z.number().int().positive().nullable().default(null),
  arbeitsmodell: z.enum(['egal', 'remote', 'hybrid', 'vor_ort']).default('egal'),
});

export const SchreibstilSchema = z.object({
  tonfall: z.enum(['sachlich', 'freundlich', 'selbstbewusst']).default('sachlich'),
  /** The user's own letter, kept whole as a style template. */
  beispielAnschreiben: z.string().nullable().default(null),
  verbotswoerter: z
    .array(z.string())
    .default(['motiviert', 'begeistert', 'entzueckt', 'leidenschaftlich']),
  maxWoerter: z.number().int().positive().default(180),
  absaetze: z.number().int().positive().default(3),
});

export const DOKUMENT_TYPEN = ['lebenslauf', 'zeugnis', 'zertifikat', 'anschreiben', 'sonstiges'] as const;

export const DokumentSchema = z.object({
  /** First 16 characters of the SHA-256 — also the file name, which kills path traversal. */
  id: z.string().min(1),
  dateiname: z.string().min(1),
  typ: z.enum(DOKUMENT_TYPEN),
  mimetype: z.string().min(1),
  seiten: z.number().int().positive().optional(),
  importiertAm: z.iso.datetime(),
});

export const PersonSchema = z.object({
  name: z.string().default(''),
  email: z.email().optional(),
  telefon: z.string().optional(),
  ort: z.string().optional(),
  links: z.record(z.string(), z.url()).default({}),
});

export const GedaechtnisSchema = z.object({
  version: z.literal(1),
  person: PersonSchema.prefault({}),
  ausbildung: z.array(AusbildungSchema).default([]),
  berufserfahrung: z.array(ErfahrungSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  zertifikate: z.array(ZertifikatSchema).default([]),
  projekte: z.array(ProjektSchema).default([]),
  sprachkenntnisse: z.array(SprachkenntnisSchema).default([]),
  praeferenzen: PraeferenzenSchema.prefault({}),
  schreibstil: SchreibstilSchema.prefault({}),
  dokumente: z.array(DokumentSchema).default([]),
});

export type Herkunft = z.infer<typeof HerkunftSchema>;
export type Ausbildung = z.infer<typeof AusbildungSchema>;
export type Erfahrung = z.infer<typeof ErfahrungSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Zertifikat = z.infer<typeof ZertifikatSchema>;
export type Projekt = z.infer<typeof ProjektSchema>;
export type Sprachkenntnis = z.infer<typeof SprachkenntnisSchema>;
export type Praeferenzen = z.infer<typeof PraeferenzenSchema>;
export type Schreibstil = z.infer<typeof SchreibstilSchema>;
export type Dokument = z.infer<typeof DokumentSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Gedaechtnis = z.infer<typeof GedaechtnisSchema>;

/** The list-shaped parts, the ones the API and the merge treat uniformly. */
export const ENTITAETEN = [
  'ausbildung',
  'berufserfahrung',
  'skills',
  'zertifikate',
  'projekte',
] as const;
export type Entitaet = (typeof ENTITAETEN)[number];

export const ENTITAET_SCHEMAS = {
  ausbildung: AusbildungSchema,
  berufserfahrung: ErfahrungSchema,
  skills: SkillSchema,
  zertifikate: ZertifikatSchema,
  projekte: ProjektSchema,
} as const;

export function leeresGedaechtnis(): Gedaechtnis {
  return GedaechtnisSchema.parse({ version: 1 });
}

/** An entry is only usable once a human confirmed it. */
export function istBestaetigt(eintrag: { herkunft: Herkunft }): boolean {
  return eintrag.herkunft.bestaetigtAm !== null;
}

/** Hand-entered data is confirmed the moment it is typed — the human is right there. */
export function manuelleHerkunft(zeitpunkt: Date = new Date()): Herkunft {
  return { methode: 'manuell', bestaetigtAm: zeitpunkt.toISOString() };
}
