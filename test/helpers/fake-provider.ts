import type { Faehigkeiten, LlmProvider, LlmRequest } from '../../llm/provider.ts';
import { LlmFehler } from '../../llm/provider.ts';

export interface FakeProvider extends LlmProvider {
  /** Every request the code under test sent, in order. */
  readonly aufrufe: LlmRequest[];
  readonly anzahlAufrufe: number;
}

/**
 * A model without a network. Hand it the answers it should give, in order; an
 * `Error` in the list is thrown instead of returned, which is how retry and
 * fallback paths get exercised without a key.
 */
export function fakeProvider(
  antworten: readonly (string | Error)[],
  optionen: { anbieter?: string; model?: string; faehigkeiten?: Partial<Faehigkeiten> } = {},
): FakeProvider {
  const aufrufe: LlmRequest[] = [];
  let index = 0;

  const faehigkeiten: Faehigkeiten = {
    vision: true,
    jsonMode: true,
    contextBudget: 40_000,
    retryTimeoutsMs: [1_000, 1_000],
    ...optionen.faehigkeiten,
  };

  return {
    anbieter: optionen.anbieter ?? 'fake',
    model: optionen.model ?? 'fake-model',
    faehigkeiten,
    aufrufe,
    get anzahlAufrufe() {
      return aufrufe.length;
    },
    complete(req: LlmRequest): Promise<string> {
      aufrufe.push(req);
      const antwort = antworten[index++];
      if (antwort === undefined) {
        return Promise.reject(
          new LlmFehler(`fakeProvider: kein Wert fuer Aufruf ${String(index)} hinterlegt`, 'fake'),
        );
      }
      if (antwort instanceof Error) return Promise.reject(antwort);
      return Promise.resolve(antwort);
    },
  };
}
