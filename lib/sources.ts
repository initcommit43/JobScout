import { z } from 'zod';
import { ladeConfigJson } from './pfade.ts';

/**
 * config/sources.json — the search queries per portal. Validated at the edge rather than
 * trusted: the file is hand-edited, and a typo there should cost one query, not the run.
 */
export const SourcesSchema = z.record(z.string().min(1), z.array(z.record(z.string(), z.string())));

export type Sources = z.infer<typeof SourcesSchema>;

export function parseSources(roh: unknown): Sources {
  const ergebnis = SourcesSchema.safeParse(roh);
  if (!ergebnis.success) {
    const stellen = ergebnis.error.issues
      .map((problem) => `${problem.path.join('.')}: ${problem.message}`)
      .join('; ');
    throw new Error(`config/sources.json ist fehlerhaft — ${stellen}`);
  }
  return ergebnis.data;
}

export async function ladeSources(): Promise<Sources> {
  return parseSources(await ladeConfigJson('sources'));
}
