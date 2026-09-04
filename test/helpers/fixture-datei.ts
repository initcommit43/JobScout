import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Fixtures are captured portal pages, so parser tests need no network. Resolved from the
 * repo root rather than cwd, because some tests switch cwd to a temp directory.
 */
const WURZEL = path.resolve(import.meta.dirname, '..', 'fixtures');

export async function fixtureText(...teile: string[]): Promise<string> {
  return readFile(path.join(WURZEL, ...teile), 'utf8');
}

export async function fixtureJson(...teile: string[]): Promise<unknown> {
  return JSON.parse(await fixtureText(...teile)) as unknown;
}
