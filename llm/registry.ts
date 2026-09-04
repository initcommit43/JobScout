import { z } from 'zod';
import { ladeConfigJson } from '../lib/pfade.ts';
import { LlmFehler, STANDARD_TIMEOUTS_MS } from './provider.ts';

/**
 * The registry holds base URL, the NAME of the env variable and capabilities — never a
 * key. That is what makes it safe to keep in the repo and what makes a new provider a
 * config line.
 */
export const ADAPTER = ['anthropic', 'google', 'openai-compatible'] as const;
export type AdapterName = (typeof ADAPTER)[number];

export const FaehigkeitenSchema = z.object({
  vision: z.boolean(),
  jsonMode: z.boolean(),
  contextBudget: z.number().int().positive(),
  retryTimeoutsMs: z.array(z.number().int().positive()).default([...STANDARD_TIMEOUTS_MS]),
});

export const AnbieterEintragSchema = z
  .object({
    label: z.string().min(1),
    adapter: z.enum(ADAPTER),
    baseURL: z.url().optional(),
    /** Absent means the provider needs no key — a local runtime such as Ollama. */
    envVar: z.string().min(1).optional(),
    faehigkeiten: FaehigkeitenSchema,
  })
  .refine((eintrag) => eintrag.adapter !== 'openai-compatible' || eintrag.baseURL !== undefined, {
    message: 'Ein openai-kompatibler Anbieter braucht eine baseURL',
    path: ['baseURL'],
  });

export const RegistrySchema = z.object({
  anbieter: z.record(z.string().min(1), AnbieterEintragSchema),
});

export type AnbieterEintrag = z.infer<typeof AnbieterEintragSchema>;
export type Registry = z.infer<typeof RegistrySchema>;

export function parseRegistry(roh: unknown): Registry {
  const ergebnis = RegistrySchema.safeParse(roh);
  if (!ergebnis.success) {
    const stellen = ergebnis.error.issues
      .map((problem) => `${problem.path.join('.')}: ${problem.message}`)
      .join('; ');
    throw new LlmFehler(`config/anbieter.json ist fehlerhaft — ${stellen}`);
  }
  return ergebnis.data;
}

export async function ladeRegistry(): Promise<Registry> {
  return parseRegistry(await ladeConfigJson('anbieter'));
}

export function anbieterEintrag(registry: Registry, name: string): AnbieterEintrag {
  const eintrag = registry.anbieter[name];
  if (eintrag === undefined) {
    const bekannte = Object.keys(registry.anbieter).sort().join(', ');
    throw new LlmFehler(
      `Anbieter "${name}" steht nicht in config/anbieter.json. Eingetragen sind: ${bekannte}.`,
      name,
    );
  }
  return eintrag;
}
