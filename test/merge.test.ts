import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGedaechtnis, normalisiereSkill, zeitraumUeberlappt } from '../profile/merge.ts';
import type { Kandidaten } from '../profile/merge.ts';
import { bestaetigt, fixtureGedaechtnis, unbestaetigt } from './helpers/fixtures.ts';

test('normalisiereSkill fasst gaengige schreibweisen zusammen', () => {
  assert.equal(normalisiereSkill('JavaScript'), normalisiereSkill('js'));
  assert.equal(normalisiereSkill('TypeScript'), normalisiereSkill(' typescript '));
  assert.equal(normalisiereSkill('Node.js'), normalisiereSkill('nodejs'));
  assert.equal(normalisiereSkill('React.js'), normalisiereSkill('React'));
  assert.equal(normalisiereSkill('C#'), 'csharp');
  assert.equal(normalisiereSkill('PostgreSQL'), normalisiereSkill('Postgres'));
});

test('normalisiereSkill wirft nicht alles in einen topf', () => {
  assert.notEqual(normalisiereSkill('Java'), normalisiereSkill('JavaScript'));
  assert.notEqual(normalisiereSkill('React'), normalisiereSkill('Vue'));
});

test('zeitraumUeberlappt erkennt ueberschneidung und luecke', () => {
  assert.equal(zeitraumUeberlappt({ von: '2020-01', bis: '2022-06' }, { von: '2021', bis: null }), true);
  assert.equal(zeitraumUeberlappt({ von: '2018', bis: '2019' }, { von: '2020', bis: '2021' }), false);
  // 'bis: null' heisst laufend und ueberlappt alles ab dem Beginn.
  assert.equal(zeitraumUeberlappt({ von: '2020-09', bis: null }, { von: '2026', bis: null }), true);
  // Ein Jahr ohne Monat reicht bis zum Jahresende.
  assert.equal(zeitraumUeberlappt({ von: '2019-01', bis: '2019' }, { von: '2019-12', bis: null }), true);
});

test('ein zweiter durchlauf mit denselben daten aendert nichts', () => {
  const basis = fixtureGedaechtnis();
  const kandidaten: Kandidaten = {
    skills: basis.skills,
    berufserfahrung: basis.berufserfahrung,
    projekte: basis.projekte,
    ausbildung: basis.ausbildung,
  };

  const ergebnis = mergeGedaechtnis(basis, kandidaten);

  assert.equal(ergebnis.gedaechtnis.skills.length, 1);
  assert.equal(ergebnis.gedaechtnis.berufserfahrung.length, 1);
  assert.equal(ergebnis.hinzugefuegt.skills, 0);
  assert.deepEqual(ergebnis.konflikte, []);
});

test('ein skill unter anderem namen wird nicht doppelt angelegt', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    skills: [
      {
        id: 'neu-1',
        name: 'typescript',
        kategorie: 'sprache',
        niveau: 'experte',
        belegIds: ['proj-1'],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.skills.length, 1);
  const skill = ergebnis.gedaechtnis.skills[0];
  assert.equal(skill?.niveau, 'experte', 'das hoehere Niveau gewinnt');
  assert.deepEqual(skill?.belegIds, ['erf-1', 'proj-1'], 'Belege werden vereinigt');
  assert.equal(skill?.id, 'skill-1', 'die bestehende ID bleibt, damit Verweise halten');
});

test('ein niedrigeres niveau senkt ein bestehendes nicht ab', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    skills: [
      {
        id: 'neu-1',
        name: 'TypeScript',
        kategorie: 'sprache',
        niveau: 'grundkenntnisse',
        belegIds: [],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.skills[0]?.niveau, 'fortgeschritten');
});

test('erfahrung bei derselben firma mit ueberlappendem zeitraum wird zusammengefuehrt', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    berufserfahrung: [
      {
        id: 'neu-1',
        firma: 'beispiel gmbh',
        position: 'Softwareentwickler',
        von: '2021-01',
        bis: null,
        taetigkeiten: ['Ablösung eines Altsystems'],
        technologien: ['PostgreSQL', 'Docker'],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.berufserfahrung.length, 1);
  const erfahrung = ergebnis.gedaechtnis.berufserfahrung[0];
  assert.deepEqual(erfahrung?.taetigkeiten, ['Wartung einer Bestellplattform', 'Ablösung eines Altsystems']);
  assert.deepEqual(erfahrung?.technologien, ['TypeScript', 'PostgreSQL', 'Docker']);
  assert.deepEqual(ergebnis.konflikte, []);
});

test('dieselbe firma zu anderer zeit ist eine eigene station', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    berufserfahrung: [
      {
        id: 'neu-1',
        firma: 'Beispiel GmbH',
        position: 'Praktikant',
        von: '2018-07',
        bis: '2018-08',
        taetigkeiten: [],
        technologien: [],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.berufserfahrung.length, 2);
  assert.equal(ergebnis.hinzugefuegt.berufserfahrung, 1);
});

test('widersprechende felder werden gemeldet, nicht still entschieden', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    berufserfahrung: [
      {
        id: 'neu-1',
        firma: 'Beispiel GmbH',
        position: 'Senior Softwareentwickler',
        von: '2021-01',
        bis: null,
        taetigkeiten: [],
        technologien: [],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.konflikte.length, 1);
  const konflikt = ergebnis.konflikte[0];
  assert.equal(konflikt?.entitaet, 'berufserfahrung');
  assert.equal(konflikt?.feld, 'position');
  assert.equal(konflikt?.bestehend, 'Softwareentwickler');
  assert.equal(konflikt?.neu, 'Senior Softwareentwickler');
  assert.equal(konflikt?.bezeichnung, 'Beispiel GmbH — Softwareentwickler');

  assert.equal(
    ergebnis.gedaechtnis.berufserfahrung[0]?.position,
    'Softwareentwickler',
    'bis zur Entscheidung bleibt der bestehende Wert stehen',
  );
});

test('ein leeres feld wird ohne konflikt gefuellt', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    ausbildung: [
      {
        id: 'neu-1',
        institution: 'HTL Musterstadt',
        abschluss: 'Matura',
        fachrichtung: 'Informatik',
        von: '2015-09',
        bis: '2020-06',
        note: 'gut',
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.ausbildung[0]?.note, 'gut');
  assert.deepEqual(ergebnis.konflikte, []);
});

test('kollidierende ids bekommen eine neue, statt einen eintrag zu ueberschreiben', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    projekte: [
      {
        id: 'proj-1', // dieselbe ID, aber ein anderes Projekt
        name: 'Zeiterfassung',
        beschreibung: 'Kleines internes Werkzeug.',
        technologien: [],
        anchor: false,
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.projekte.length, 2);
  const ids = ergebnis.gedaechtnis.projekte.map((projekt) => projekt.id);
  assert.equal(new Set(ids).size, 2, 'IDs bleiben eindeutig');
  assert.ok(ergebnis.gedaechtnis.projekte.some((projekt) => projekt.name === 'Bestellplattform'));
});

test('anchor bleibt gesetzt, wenn eine seite es setzt', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    projekte: [
      {
        id: 'neu-1',
        name: 'bestellplattform',
        beschreibung: 'Altsystem in Etappen abgeloest.',
        technologien: ['PostgreSQL'],
        anchor: false,
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.projekte[0]?.anchor, true);
});

test('eine bestaetigung ersetzt eine unbestaetigte herkunft', () => {
  const basis = fixtureGedaechtnis();
  basis.skills[0] = { ...basis.skills[0]!, herkunft: unbestaetigt() };

  const ergebnis = mergeGedaechtnis(basis, {
    skills: [
      {
        id: 'neu-1',
        name: 'TypeScript',
        kategorie: 'sprache',
        belegIds: [],
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.skills[0]?.herkunft.bestaetigtAm, '2026-01-15T10:00:00.000Z');
});

test('eine unbestaetigte kandidatur entwertet eine bestaetigte herkunft nicht', () => {
  const basis = fixtureGedaechtnis();
  const ergebnis = mergeGedaechtnis(basis, {
    skills: [
      {
        id: 'neu-1',
        name: 'TypeScript',
        kategorie: 'sprache',
        belegIds: [],
        herkunft: unbestaetigt(),
      },
    ],
  });

  assert.notEqual(ergebnis.gedaechtnis.skills[0]?.herkunft.bestaetigtAm, null);
});

test('der merge laesst das uebergebene gedaechtnis unangetastet', () => {
  const basis = fixtureGedaechtnis();
  const vorher = JSON.stringify(basis);

  mergeGedaechtnis(basis, {
    skills: [
      { id: 'neu-1', name: 'Docker', kategorie: 'devops', belegIds: [], herkunft: bestaetigt() },
    ],
  });

  assert.equal(JSON.stringify(basis), vorher);
});

test('zertifikate treffen sich ueber name und aussteller', () => {
  const basis = fixtureGedaechtnis({
    zertifikate: [
      {
        id: 'zert-1',
        name: 'Scrum Master',
        aussteller: 'Scrum Alliance',
        ausgestelltAm: '2023-05',
        gueltigBis: null,
        herkunft: bestaetigt(),
      },
    ],
  });

  const ergebnis = mergeGedaechtnis(basis, {
    zertifikate: [
      {
        id: 'neu-1',
        name: 'scrum master',
        aussteller: 'scrum alliance',
        ausgestelltAm: '2023-05',
        gueltigBis: '2025-05',
        herkunft: bestaetigt(),
      },
      {
        id: 'neu-2',
        name: 'Scrum Master',
        aussteller: 'Anderer Anbieter',
        ausgestelltAm: '2024-01',
        gueltigBis: null,
        herkunft: bestaetigt(),
      },
    ],
  });

  assert.equal(ergebnis.gedaechtnis.zertifikate.length, 2);
  assert.equal(ergebnis.gedaechtnis.zertifikate[0]?.gueltigBis, '2025-05');
});
