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

function verfolgteDateien(muster?: string): string[] {
  const args = muster === undefined ? ['ls-files'] : ['ls-files', '--', muster];
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .filter((zeile) => zeile.length > 0);
}

test('geheimnisse und private daten sind ignoriert', () => {
  for (const pfad of [
    '.env',
    '.env.local',
    'data/jobs/irgendein-job.json',
    'data/profil/gedaechtnis.json',
    'config/settings.json',
    'config/anbieter.json',
    'plan.md',
    'CLAUDE.md',
    'AGENTS.md',
    'MEMORY.md',
    'memory/notiz.md',
    '.claude/settings.local.json',
  ]) {
    assert.ok(istIgnoriert(pfad), `${pfad} muss von git ignoriert werden`);
  }
});

test('.env.example und die vorlagen bleiben verfolgbar', () => {
  assert.ok(!istIgnoriert('.env.example'), '.env.example wird gebraucht');
  assert.ok(!istIgnoriert('config/settings.example.json'), 'Vorlagen muessen committet werden koennen');
});

/**
 * Der allgemeine Fall, unabhaengig von der Liste oben: was ignoriert ist, darf nicht im
 * Index liegen. Faengt auch Eintraege, die spaeter zur Ignore-Liste dazukommen.
 */
test('keine ignorierte datei ist verfolgt', () => {
  const verfolgt = verfolgteDateien();
  assert.ok(verfolgt.length > 0, 'ohne verfolgte Dateien testet das nichts');

  const unerlaubt = verfolgt.filter((datei) => istIgnoriert(datei));
  assert.deepEqual(unerlaubt, [], 'ignorierte Dateien gehoeren nicht in den Index');
});

test('keine echte konfiguration ist verfolgt', () => {
  const unerlaubt = verfolgteDateien('config/*.json').filter((datei) => !datei.endsWith('.example.json'));
  assert.deepEqual(unerlaubt, [], 'nur config/*.example.json darf im Index liegen');
});

test('keine echte .env-datei ist verfolgt', () => {
  const unerlaubt = verfolgteDateien('.env*').filter((datei) => datei !== '.env.example');
  assert.deepEqual(unerlaubt, [], 'im Index darf nur .env.example liegen');
});

test('kein quelltext enthaelt eine fremde e-mail-adresse', () => {
  // .html gehoert ausdruecklich dazu: die Scraper-Fixtures sind mitgeschnittene echte
  // Stellenanzeigen und brachten Kontaktadressen samt einem Sentry-Token mit.
  const verfolgt = verfolgteDateien().filter((datei) =>
    /\.(ts|tsx|js|json|md|yml|yaml|html|htm|txt|csv)$/.test(datei),
  );

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
      if (erlaubt.test(fund)) continue;
      treffer.push(`${datei}: ${fund}`);
    }
  }

  assert.deepEqual(treffer, [], 'E-Mail-Adressen im Repo nur als @example.com-Platzhalter');
});

/** Fremde Signaturen und private Adressen gehoeren nicht in die Historie. */
test('keine commit-nachricht traegt einen fremden abbinder', () => {
  const nachrichten = execFileSync('git', ['log', '--format=%B%x00'], { encoding: 'utf8' });

  assert.doesNotMatch(nachrichten, /^\s*co-authored-by:/im, 'Mitautoren-Abbinder in der Historie');
  assert.doesNotMatch(nachrichten, /^\s*generated (with|by)/im, 'Werkzeug-Abbinder in der Historie');
  assert.doesNotMatch(nachrichten, /no-?reply@/i, 'noreply-Adresse in der Historie');
});

test('kein autor traegt eine private mailadresse', () => {
  const autoren = execFileSync('git', ['log', '--format=%ae%n%ce'], { encoding: 'utf8' });
  const privat = [...new Set(autoren.split('\n'))].filter((adresse) =>
    /@(gmail|gmx|web|outlook|hotmail|yahoo)\./.test(adresse),
  );

  // Ein einzelner Autor aus der uebernommenen Vorgeschichte ist bekannt; die eigene
  // Identitaet laeuft ausschliesslich ueber die noreply-Adresse.
  assert.ok(privat.length <= 1, `unerwartete private Adressen als Autor: ${privat.join(', ')}`);
});
