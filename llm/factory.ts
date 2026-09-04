import type { Einstellungen } from '../lib/einstellungen.ts';
import { ladeEinstellungen } from '../lib/einstellungen.ts';
import { createAnthropic } from './anthropic.ts';
import { createGoogle } from './google.ts';
import { createOpenAiCompatible } from './openai-compatible.ts';
import type { Aufgabe, LlmProvider } from './provider.ts';
import { LlmFehler } from './provider.ts';
import type { AnbieterEintrag, Registry } from './registry.ts';
import { anbieterEintrag, ladeRegistry } from './registry.ts';

export interface Anforderungen {
  /** Set for scanned documents. Refusing here beats a silent bad extraction. */
  vision?: boolean;
}

/** Injected so tests never touch disk or process.env. */
export interface FactoryUmgebung {
  registry: Registry;
  einstellungen: Einstellungen;
  env: Record<string, string | undefined>;
}

export async function ladeUmgebung(): Promise<FactoryUmgebung> {
  const [registry, einstellungen] = await Promise.all([ladeRegistry(), ladeEinstellungen()]);
  return { registry, einstellungen, env: process.env };
}

/**
 * Resolves the provider configured for a task. Every failure here is a configuration
 * mistake the user can fix, so every message names the file and the missing value.
 */
export function createProviderMit(
  umgebung: FactoryUmgebung,
  aufgabe: Aufgabe,
  anforderungen: Anforderungen = {},
): LlmProvider {
  const auswahl = umgebung.einstellungen.llm[aufgabe];
  const eintrag = anbieterEintrag(umgebung.registry, auswahl.anbieter);

  if (auswahl.model === '') {
    throw new LlmFehler(
      `Fuer die Aufgabe "${aufgabe}" ist kein Modell eingetragen. ` +
        `Modell-ID fuer ${eintrag.label} in config/settings.json unter llm.${aufgabe}.model setzen.`,
      auswahl.anbieter,
    );
  }

  if (anforderungen.vision === true && !eintrag.faehigkeiten.vision) {
    throw new LlmFehler(
      `Die Aufgabe "${aufgabe}" braucht ein bildfaehiges Modell, ${eintrag.label} kann keine Bilder lesen. ` +
        `In config/settings.json unter llm.${aufgabe} einen bildfaehigen Anbieter waehlen.`,
      auswahl.anbieter,
    );
  }

  return baueProvider(auswahl.anbieter, eintrag, auswahl.model, schluessel(umgebung, auswahl.anbieter, eintrag));
}

export async function createProvider(aufgabe: Aufgabe, anforderungen: Anforderungen = {}): Promise<LlmProvider> {
  return createProviderMit(await ladeUmgebung(), aufgabe, anforderungen);
}

/**
 * A provider instance solely for listing models. The model id stays empty: the whole
 * point of the call is to find out which ids exist.
 */
export function createModellLister(umgebung: FactoryUmgebung, name: string): LlmProvider {
  const eintrag = anbieterEintrag(umgebung.registry, name);
  return baueProvider(name, eintrag, '', schluessel(umgebung, name, eintrag));
}

export async function modelleFuerAnbieter(name: string): Promise<string[]> {
  const provider = createModellLister(await ladeUmgebung(), name);
  if (provider.modelle === undefined) {
    throw new LlmFehler(`Anbieter ${name} bietet keine Modellliste an. Modell-ID von Hand eintragen.`, name);
  }
  return provider.modelle();
}

/** Whether a key is on file — never the value itself. */
export function schluesselVorhanden(umgebung: FactoryUmgebung, name: string): boolean {
  const eintrag = anbieterEintrag(umgebung.registry, name);
  if (eintrag.envVar === undefined) return true;
  const wert = umgebung.env[eintrag.envVar];
  return wert !== undefined && wert.trim() !== '';
}

function schluessel(umgebung: FactoryUmgebung, name: string, eintrag: AnbieterEintrag): string | undefined {
  if (eintrag.envVar === undefined) return undefined; // local runtime, no key needed

  const wert = umgebung.env[eintrag.envVar];
  if (wert === undefined || wert.trim() === '') {
    throw new LlmFehler(
      `Fuer Anbieter "${name}" fehlt ${eintrag.envVar} in .env. ` +
        'Schluessel dort eintragen (Vorlage: .env.example) und neu starten.',
      name,
    );
  }
  return wert.trim();
}

function baueProvider(
  name: string,
  eintrag: AnbieterEintrag,
  model: string,
  apiKey: string | undefined,
): LlmProvider {
  switch (eintrag.adapter) {
    case 'anthropic':
      return createAnthropic({
        anbieter: name,
        model,
        apiKey: apiKey ?? '',
        ...(eintrag.baseURL === undefined ? {} : { baseURL: eintrag.baseURL }),
        faehigkeiten: eintrag.faehigkeiten,
      });

    case 'google':
      return createGoogle({
        anbieter: name,
        model,
        apiKey: apiKey ?? '',
        ...(eintrag.baseURL === undefined ? {} : { baseURL: eintrag.baseURL }),
        faehigkeiten: eintrag.faehigkeiten,
      });

    case 'openai-compatible':
      // The schema guarantees baseURL for this adapter.
      return createOpenAiCompatible({
        anbieter: name,
        model,
        baseURL: eintrag.baseURL ?? '',
        ...(apiKey === undefined ? {} : { apiKey }),
        faehigkeiten: eintrag.faehigkeiten,
      });
  }
}
