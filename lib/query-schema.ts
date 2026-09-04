import type { QueryField, ScraperAdapter, SourceQuery } from '../scrapers/interface.ts';

export type QueryProblem =
  | { kind: 'missing'; key: string }
  | { kind: 'unknown'; key: string; expected: string[] };

/** Checks a single query against its portal's schema. Empty result means fine. */
export function checkQuery(schema: QueryField[], query: SourceQuery): QueryProblem[] {
  const bekannt = schema.map((feld) => feld.key);
  const probleme: QueryProblem[] = [];

  for (const feld of schema) {
    if (feld.required && (query[feld.key]?.trim() ?? '') === '') {
      probleme.push({ kind: 'missing', key: feld.key });
    }
  }
  for (const key of Object.keys(query)) {
    if (!bekannt.includes(key)) probleme.push({ kind: 'unknown', key, expected: bekannt });
  }
  return probleme;
}

export function describeProblem(problem: QueryProblem): string {
  return problem.kind === 'missing'
    ? `Pflichtfeld "${problem.key}" fehlt`
    : `unbekannter Schluessel "${problem.key}" — erwartet: ${problem.expected.join(', ')}`;
}

/**
 * Replaces the silent `if (!keyword) continue;` every adapter used to carry: a broken
 * query still drops out, but says so. The run does not abort — a typo in one of twenty
 * queries must not cost the whole scrape.
 *
 * `warn` is injected so tests can inspect the output without hijacking console.
 */
export function usableQueries(
  adapter: Pick<ScraperAdapter, 'name' | 'querySchema'>,
  queries: SourceQuery[],
  warn: (nachricht: string) => void = console.warn,
): SourceQuery[] {
  return queries.filter((query, index) => {
    const probleme = checkQuery(adapter.querySchema, query);
    if (probleme.length === 0) return true;
    warn(
      `[${adapter.name}] Anfrage ${String(index + 1)} uebersprungen — ${probleme.map(describeProblem).join('; ')}`,
    );
    return false;
  });
}
