/**
 * The one contract every model speaks through. Callers never learn which vendor is
 * behind it — that is what lets a new provider be a config line instead of code.
 */

export type Aufgabe = 'filter' | 'writer' | 'extract';

export const AUFGABEN: readonly Aufgabe[] = ['filter', 'writer', 'extract'];

export interface LlmBild {
  mimetype: string;
  /** Raw base64, without the `data:` prefix. */
  base64: string;
}

export interface LlmRequest {
  system: string;
  user: string;
  /** Only honoured by providers whose `faehigkeiten.vision` is true. */
  bilder?: LlmBild[];
  json?: boolean;
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Faehigkeiten {
  vision: boolean;
  jsonMode: boolean;
  /** Characters of job text we can afford to send. */
  contextBudget: number;
  /** One timeout per attempt; the length is the attempt count. Local models need minutes. */
  retryTimeoutsMs: number[];
}

export interface LlmProvider {
  readonly anbieter: string;
  readonly model: string;
  readonly faehigkeiten: Faehigkeiten;
  complete(req: LlmRequest): Promise<string>;
  /** Live model list from the vendor. Absent where the vendor has no such endpoint. */
  modelle?(): Promise<string[]>;
}

/** Cloud providers answer in seconds; two attempts are plenty. */
export const STANDARD_TIMEOUTS_MS: readonly number[] = [60_000, 90_000];

/**
 * Every failure the user can act on. The message is German and says what to do —
 * a provider that fails silently costs more time than one that fails loudly.
 */
export class LlmFehler extends Error {
  readonly anbieter: string | undefined;

  constructor(nachricht: string, anbieter?: string, options?: { cause?: unknown }) {
    super(nachricht, options);
    this.name = 'LlmFehler';
    this.anbieter = anbieter;
  }
}

/**
 * Models like to wrap JSON in prose or a ```json fence even when told not to.
 * Pull the outermost object or array out instead of failing the whole run.
 */
export function extrahiereJson(antwort: string): string {
  const ohneFence = antwort.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const getrimmt = ohneFence.trim();
  if (getrimmt.startsWith('{') || getrimmt.startsWith('[')) return getrimmt;

  const start = getrimmt.search(/[[{]/);
  if (start === -1) return getrimmt;

  const oeffnend = getrimmt[start];
  const schliessend = oeffnend === '{' ? '}' : ']';
  const ende = getrimmt.lastIndexOf(schliessend);
  if (ende <= start) return getrimmt;

  return getrimmt.slice(start, ende + 1);
}

/**
 * Fallback for providers without a JSON mode: state the contract in the prompt.
 * Weaker than a real schema-constrained call, which is why it is only the fallback.
 */
export function systemMitSchema(system: string, jsonSchema?: Record<string, unknown>): string {
  const regel = jsonSchema
    ? `Antworte ausschliesslich mit JSON nach diesem JSON-Schema. Kein Fliesstext, keine Code-Fences.\n${JSON.stringify(jsonSchema)}`
    : 'Antworte ausschliesslich mit gueltigem JSON. Kein Fliesstext, keine Code-Fences.';
  return `${system}\n\n${regel}`;
}

/**
 * One AbortSignal per attempt: the caller's cancellation and this attempt's timeout.
 * The user's abort must win immediately, not after the timeout expires.
 */
export function versuchsSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

/** Read fresh each time: the flag flips mid-run, so a narrowed type would lie. */
function istAbgebrochen(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

/**
 * Retry across the configured timeouts. A caller-side abort ends the run at once —
 * retrying something the user cancelled is never what they meant.
 */
export async function mitWiederholung<T>(
  anbieter: string,
  timeouts: readonly number[],
  signal: AbortSignal | undefined,
  versuch: (timeoutMs: number, versuchsSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const plan = timeouts.length > 0 ? timeouts : STANDARD_TIMEOUTS_MS;
  let letzterFehler: unknown;

  for (const [index, timeoutMs] of plan.entries()) {
    if (istAbgebrochen(signal)) {
      throw new LlmFehler(`Der Aufruf an ${anbieter} wurde abgebrochen.`, anbieter);
    }
    try {
      return await versuch(timeoutMs, versuchsSignal(timeoutMs, signal));
    } catch (fehler) {
      if (istAbgebrochen(signal)) {
        throw new LlmFehler(`Der Aufruf an ${anbieter} wurde abgebrochen.`, anbieter, { cause: fehler });
      }
      letzterFehler = fehler;
      if (index === plan.length - 1) break;
    }
  }

  const grund = letzterFehler instanceof Error ? letzterFehler.message : String(letzterFehler);
  throw new LlmFehler(
    `Anbieter ${anbieter} hat nach ${plan.length} Versuchen nicht geantwortet: ${grund}`,
    anbieter,
    { cause: letzterFehler },
  );
}
