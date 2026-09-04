import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Every path resolves against the current working directory — never against
 * `import.meta.url`. In the template that mistake let a server started from a copied
 * directory write into the real repo's config. cwd-relative keeps a stray start
 * harmless: it works on its own data or on nothing.
 */
export function projektPfad(...teile: string[]): string {
  return path.resolve(process.cwd(), ...teile);
}

export function configPfad(datei: string): string {
  return projektPfad('config', datei);
}

export function dataPfad(...teile: string[]): string {
  return projektPfad('data', ...teile);
}

/**
 * Real config is gitignored, so a fresh clone has only the templates. Falling back to
 * `<name>.example.json` means the tool runs immediately after cloning instead of
 * greeting the user with a missing-file error.
 */
export async function ladeConfigJson(name: string): Promise<unknown> {
  const eigen = configPfad(`${name}.json`);
  try {
    return JSON.parse(await readFile(eigen, 'utf8')) as unknown;
  } catch (fehler) {
    if (!istNichtGefunden(fehler)) throw fehler;
  }

  const vorlage = configPfad(`${name}.example.json`);
  return JSON.parse(await readFile(vorlage, 'utf8')) as unknown;
}

function istNichtGefunden(fehler: unknown): boolean {
  return fehler instanceof Error && 'code' in fehler && fehler.code === 'ENOENT';
}
