/**
 * Small readers for JSON that a portal hands us. Portal payloads are `unknown` — they
 * change without notice — so reading them through these keeps the adapters free of
 * `any` casts that would silently pretend a field exists.
 */

export function readPath(wert: unknown, ...schluessel: (string | number)[]): unknown {
  let aktuell = wert;
  for (const teil of schluessel) {
    if (aktuell === null || typeof aktuell !== 'object') return undefined;
    aktuell = (aktuell as Record<string | number, unknown>)[teil];
  }
  return aktuell;
}

export function asString(wert: unknown): string | undefined {
  return typeof wert === 'string' ? wert : undefined;
}

export function asNumber(wert: unknown): number | undefined {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined;
}

export function asArray(wert: unknown): unknown[] {
  return Array.isArray(wert) ? wert : [];
}

/** First non-empty string among the candidates — the usual "field A, else field B". */
export function firstText(...kandidaten: unknown[]): string | undefined {
  for (const kandidat of kandidaten) {
    const text = asString(kandidat);
    if (text !== undefined && text.trim() !== '') return text;
  }
  return undefined;
}
