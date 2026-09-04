import OpenAI from 'openai';
import type { ChatCompletionContentPart, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { Faehigkeiten, LlmProvider, LlmRequest } from './provider.ts';
import { LlmFehler, extrahiereJson, mitWiederholung, systemMitSchema } from './provider.ts';

/**
 * Covers everything that speaks /v1/chat/completions: OpenAI, Kimi, Qwen, GLM,
 * Hunyuan, DeepSeek, OpenRouter, Ollama, LM Studio, vLLM. Adding one of those is a
 * baseURL plus a model id, which is the whole point of this adapter existing first.
 */
export interface OpenAiKompatibelOptionen {
  anbieter: string;
  model: string;
  baseURL: string;
  apiKey?: string;
  faehigkeiten: Faehigkeiten;
}

export function createOpenAiCompatible(optionen: OpenAiKompatibelOptionen): LlmProvider {
  const { anbieter, model, baseURL, faehigkeiten } = optionen;

  const client = new OpenAI({
    baseURL,
    // Local runtimes accept any string; sending a placeholder is friendlier than
    // making the caller invent one for a server that ignores it.
    apiKey: optionen.apiKey ?? 'kein-schluessel-noetig',
    maxRetries: 0, // retrying is mitWiederholung's job, so the timeout plan stays honest
  });

  function nutzerInhalt(req: LlmRequest): string | ChatCompletionContentPart[] {
    const bilder = req.bilder ?? [];
    if (bilder.length === 0) return req.user;

    if (!faehigkeiten.vision) {
      throw new LlmFehler(
        `Anbieter ${anbieter} (Modell ${model}) kann keine Bilder lesen. ` +
          'Fuer gescannte Dokumente in den Einstellungen ein bildfaehiges Modell waehlen.',
        anbieter,
      );
    }

    return [
      { type: 'text', text: req.user },
      ...bilder.map<ChatCompletionContentPart>((bild) => ({
        type: 'image_url',
        image_url: { url: `data:${bild.mimetype};base64,${bild.base64}` },
      })),
    ];
  }

  return {
    anbieter,
    model,
    faehigkeiten,

    async complete(req: LlmRequest): Promise<string> {
      const willJson = req.json === true;
      // Without a native JSON mode the contract has to travel in the prompt.
      const system = willJson && !faehigkeiten.jsonMode ? systemMitSchema(req.system, req.jsonSchema) : req.system;

      const anfrage: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: nutzerInhalt(req) },
        ],
        ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        ...(req.maxTokens === undefined ? {} : { max_completion_tokens: req.maxTokens }),
        ...(willJson && faehigkeiten.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      };

      const antwort = await mitWiederholung(
        anbieter,
        faehigkeiten.retryTimeoutsMs,
        req.signal,
        async (_timeoutMs, signal) => {
          const ergebnis = await client.chat.completions.create(anfrage, { signal });
          const inhalt = ergebnis.choices[0]?.message.content;
          if (inhalt === null || inhalt === undefined || inhalt === '') {
            throw new Error('leere Antwort ohne Inhalt');
          }
          return inhalt;
        },
      );

      return willJson ? extrahiereJson(antwort) : antwort;
    },

    async modelle(): Promise<string[]> {
      try {
        const liste = await client.models.list();
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
