import { z } from 'zod';
import { ladeConfigJson } from './pfade.ts';

/**
 * config/settings.json. Holds provider name and model id — never a key. There is
 * deliberately no write path that could put a key here.
 */
const LlmAuswahlSchema = z.object({
  anbieter: z.string().min(1),
  /** Free text on purpose: model ids age faster than any repo. */
  model: z.string().default(''),
});

export const EinstellungenSchema = z.object({
  llm: z.object({
    filter: LlmAuswahlSchema,
    writer: LlmAuswahlSchema,
    extract: LlmAuswahlSchema,
  }),
  filterModus: z.enum(['regex', 'llm']).default('regex'),
  /** Draft by default so a fresh clone cannot send anything by accident. */
  sendMode: z.enum(['entwurf', 'versand']).default('entwurf'),
});

export type LlmAuswahl = z.infer<typeof LlmAuswahlSchema>;
export type Einstellungen = z.infer<typeof EinstellungenSchema>;

export function parseEinstellungen(roh: unknown): Einstellungen {
  const ergebnis = EinstellungenSchema.safeParse(roh);
  if (!ergebnis.success) {
    const stellen = ergebnis.error.issues
      .map((problem) => `${problem.path.join('.')}: ${problem.message}`)
      .join('; ');
    throw new Error(`config/settings.json ist fehlerhaft — ${stellen}`);
  }
  return ergebnis.data;
}

export async function ladeEinstellungen(): Promise<Einstellungen> {
  return parseEinstellungen(await ladeConfigJson('settings'));
}
