import { GoogleGenAI, type Part } from '@google/genai';
import type { Faehigkeiten, LlmProvider, LlmRequest } from './provider.ts';
import { LlmFehler, extrahiereJson, mitWiederholung } from './provider.ts';

/** Gemini. Its own request format, hence its own adapter. */
export interface GoogleOptionen {
  anbieter: string;
  model: string;
  apiKey: string;
  /** Overrides the SDK default; used for a proxy or, in tests, a loopback stand-in. */
  baseURL?: string;
  faehigkeiten: Faehigkeiten;
}

export function createGoogle(optionen: GoogleOptionen): LlmProvider {
  const { anbieter, model, faehigkeiten } = optionen;
  const client = new GoogleGenAI({
    apiKey: optionen.apiKey,
    ...(optionen.baseURL === undefined ? {} : { httpOptions: { baseUrl: optionen.baseURL } }),
  });

  function teile(req: LlmRequest): Part[] {
    const bilder = req.bilder ?? [];
    if (bilder.length > 0 && !faehigkeiten.vision) {
      throw new LlmFehler(
        `Anbieter ${anbieter} (Modell ${model}) kann keine Bilder lesen. ` +
          'Fuer gescannte Dokumente in den Einstellungen ein bildfaehiges Modell waehlen.',
        anbieter,
      );
    }

    return [
      { text: req.user },
      ...bilder.map<Part>((bild) => ({
        inlineData: { mimeType: bild.mimetype, data: bild.base64 },
      })),
    ];
  }

  return {
    anbieter,
    model,
    faehigkeiten,

    async complete(req: LlmRequest): Promise<string> {
      const willJson = req.json === true;

      const antwort = await mitWiederholung(
        anbieter,
        faehigkeiten.retryTimeoutsMs,
        req.signal,
        async (_timeoutMs, signal) => {
          const ergebnis = await client.models.generateContent({
            model,
            contents: [{ role: 'user', parts: teile(req) }],
            config: {
              systemInstruction: req.system,
              abortSignal: signal,
              ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
              ...(req.maxTokens === undefined ? {} : { maxOutputTokens: req.maxTokens }),
              ...(willJson
                ? {
                    responseMimeType: 'application/json',
                    ...(req.jsonSchema === undefined ? {} : { responseJsonSchema: req.jsonSchema }),
                  }
                : {}),
            },
          });

          const text = ergebnis.text;
          if (text === undefined || text === '') throw new Error('leere Antwort ohne Inhalt');
          return text;
        },
      );

      return willJson ? extrahiereJson(antwort) : antwort;
    },

    async modelle(): Promise<string[]> {
      try {
        const seite = await client.models.list();
        const namen: string[] = [];
        for await (const eintrag of seite) {
          // Gemini reports "models/gemini-…"; the settings field wants the bare id.
          if (eintrag.name !== undefined) namen.push(eintrag.name.replace(/^models\//, ''));
        }
        return namen.sort((a, b) => a.localeCompare(b));
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
