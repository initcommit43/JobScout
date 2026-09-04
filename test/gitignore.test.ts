import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Security regression suite. Runs on every commit, not just during the hardening phase:
// leaking a key or a real application into a public repo cannot be taken back.

function istIgnoriert(pfad: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', pfad], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function verfolgteDateien(muster: string): string[] {
  const ausgabe = execFileSync('git', ['ls-files', '--', muster], { encoding: 'utf8' });
  return ausgabe.split('\n').filter((zeile) => zeile.length > 0);
}

test('geheimnisse und private daten sind ignoriert', () => {
  for (const pfad of [
    '.env',
    '.env.local',
    'data/jobs/irgendein-job.json',
    'data/profil/gedaechtnis.json',
    'plan.md',
    'CLAUDE.md',
    'MEMORY.md',
    'memory/notiz.md',
    '.claude/settings.local.json',
    'config/settings.json',
    'config/anbieter.json',
  ]) {
    assert.ok(istIgnoriert(pfad), `${pfad} muss von git ignoriert werden`);
  }
});

test('.env.example bleibt verfolgbar', () => {
  assert.ok(!istIgnoriert('.env.example'), '.env.example wird gebraucht und darf nicht ignoriert sein');
  assert.ok(!istIgnoriert('config/settings.example.json'), 'Vorlagen muessen committet werden koennen');
});

test('keine echte konfiguration ist verfolgt', () => {
  const verfolgt = verfolgteDateien('config/*.json');
  const unerlaubt = verfolgt.filter((datei) => !datei.endsWith('.example.json'));
  assert.deepEqual(unerlaubt, [], 'nur config/*.example.json darf im Index liegen');
});

test('keine echte .env-datei ist verfolgt', () => {
  const unerlaubt = verfolgteDateien('.env*').filter((datei) => datei !== '.env.example');
  assert.deepEqual(unerlaubt, [], 'im Index darf nur .env.example liegen');
});

test('kein arbeitsdokument ist verfolgt', () => {
  for (const muster of ['plan.md', 'CLAUDE.md', 'AGENTS.md', 'MEMORY.md', 'memory/**', '.claude/**']) {
    assert.deepEqual(verfolgteDateien(muster), [], `${muster} darf nicht im Index liegen`);
  }
});

test('kein quelltext enthaelt eine fremde e-mail-adresse', () => {
  // .html gehoert ausdruecklich dazu: die Scraper-Fixtures sind mitgeschnittene echte
  // Stellenanzeigen und brachten Kontaktadressen samt einem Sentry-Token mit.
  const verfolgt = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((datei) => /\.(ts|tsx|js|json|md|yml|yaml|html|htm|txt|csv)$/.test(datei));

  const adresse = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const erlaubt = /@(example\.com|example\.org|firmenabc\.at)$/;
  const treffer: string[] = [];

  for (const datei of verfolgt) {
    let inhalt: string;
    try {
      inhalt = execFileSync('git', ['show', `:${datei}`], { encoding: 'utf8' });
    } catch {
      continue; // nicht im Index, etwa waehrend eines Merges
    }
    for (const fund of inhalt.match(adresse) ?? []) {
      // Platzhalter und Bot-Adressen von Werkzeugen sind kein Personenbezug.
      if (erlaubt.test(fund)) continue;
      if (fund === 'noreply@anthropic.com') continue;
      treffer.push(`${datei}: ${fund}`);
    }
  }

  assert.deepEqual(treffer, [], 'E-Mail-Adressen im Repo nur als @example.com-Platzhalter');
});
