import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { Faehigkeiten, LlmProvider, LlmRequest } from './provider.ts';
import { LlmFehler, extrahiereJson, mitWiederholung, systemMitSchema } from './provider.ts';

/**
 * Claude via the Messages API. Also serves Moonshot's /anthropic endpoint, which is
 * why baseURL is configurable rather than hardcoded to the SDK default.
 */
export interface AnthropicOptionen {
  anbieter: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  faehigkeiten: Faehigkeiten;
}

/** Messages API demands a bound; generous enough for a full Anschreiben. */
const MAX_TOKENS_STANDARD = 4_096;

/** Name of the tool used to force structured output. Never shown to the user. */
const ANTWORT_WERKZEUG = 'antwort';

export function createAnthropic(optionen: AnthropicOptionen): LlmProvider {
  const { anbieter, model, faehigkeiten } = optionen;

  const client = new Anthropic({
    apiKey: optionen.apiKey,
    ...(optionen.baseURL === undefined ? {} : { baseURL: optionen.baseURL }),
    maxRetries: 0,
  });

  function inhaltsBloecke(req: LlmRequest): ContentBlockParam[] {
    const bilder = req.bilder ?? [];
    if (bilder.length > 0 && !faehigkeiten.vision) {
      throw new LlmFehler(
        `Anbieter ${anbieter} (Modell ${model}) kann keine Bilder lesen. ` +
          'Fuer gescannte Dokumente in den Einstellungen ein bildfaehiges Modell waehlen.',
        anbieter,
      );
    }

    return [
      { type: 'text', text: req.user },
      ...bilder.map<ContentBlockParam>((bild) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: bild.mimetype as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: bild.base64,
        },
      })),
    ];
  }

  return {
    anbieter,
    model,
    faehigkeiten,

    async complete(req: LlmRequest): Promise<string> {
      const willJson = req.json === true;
      // The Messages API has no response_format. A single forced tool call is the
      // reliable path to schema-shaped output; prefilling only nudges.
      const ueberWerkzeug = willJson && req.jsonSchema !== undefined;

      const anfrage: MessageCreateParamsNonStreaming = {
        model,
        max_tokens: req.maxTokens ?? MAX_TOKENS_STANDARD,
        system: willJson && !ueberWerkzeug ? systemMitSchema(req.system, req.jsonSchema) : req.system,
        messages: [{ role: 'user', content: inhaltsBloecke(req) }],
        ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        ...(ueberWerkzeug
          ? {
              tools: [
                {
                  name: ANTWORT_WERKZEUG,
                  description: 'Gibt die Antwort in der vorgegebenen Struktur zurueck.',
                  input_schema: req.jsonSchema as Anthropic.Tool.InputSchema,
                },
              ],
              tool_choice: { type: 'tool' as const, name: ANTWORT_WERKZEUG },
            }
          : {}),
      };

      const antwort = await mitWiederholung(
        anbieter,
        faehigkeiten.retryTimeoutsMs,
        req.signal,
        async (_timeoutMs, signal) => {
          const ergebnis = await client.messages.create(anfrage, { signal });

          if (ueberWerkzeug) {
            const werkzeug = ergebnis.content.find((block) => block.type === 'tool_use');
            if (werkzeug === undefined) throw new Error('Antwort ohne den erwarteten Werkzeugaufruf');
            return JSON.stringify(werkzeug.input);
          }

          const text = ergebnis.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');
          if (text === '') throw new Error('leere Antwort ohne Inhalt');
          return text;
        },
      );

      return willJson && !ueberWerkzeug ? extrahiereJson(antwort) : antwort;
    },

    async modelle(): Promise<string[]> {
      try {
        const liste = await client.models.list({ limit: 100 });
        return liste.data.map((eintrag) => eintrag.id).sort((a, b) => a.localeCompare(b));
      } catch (fehler) {
        throw new LlmFehler(
          `Modellliste von ${anbieter} konnte nicht geladen werden. Modell-ID von Hand eintragen.`,
          anbieter,
          { cause: fehler },
        );
      }
    },
  };
}
