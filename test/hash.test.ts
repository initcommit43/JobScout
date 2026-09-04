import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobId } from '../lib/hash.ts';

test('dieselbe stelle ergibt dieselbe id', () => {
  const a = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  const b = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test('geschlechtsmarker im titel aendern die id nicht', () => {
  const ohne = jobId({ title: 'Softwareentwickler', company: 'Beispiel GmbH' });
  for (const titel of [
    'Softwareentwickler (m/w/d)',
    'Softwareentwickler m/f/x',
    'Softwareentwickler:in',
    'Softwareentwickler*in',
  ]) {
    assert.equal(jobId({ title: titel, company: 'Beispiel GmbH' }), ohne, titel);
  }
});

test('ein wort, das nur auf -in endet, bleibt unangetastet', () => {
  assert.notEqual(
    jobId({ title: 'Marketing', company: 'Beispiel GmbH' }),
    jobId({ title: 'Market', company: 'Beispiel GmbH' }),
  );
});

test('unterschiedliche satzzeichen ergeben dieselbe id', () => {
  // Echter Fall: karriere.at fuehrte "… (m/w/d) – 1st Level", jobs.at dieselbe Stelle
  // ohne Gedankenstrich. Nur Leerzeichen zu kollabieren liess zwei IDs stehen.
  assert.equal(
    jobId({ title: 'Technical Support Engineer (m/w/d) – 1st Level', company: 'Beispiel GmbH' }),
    jobId({ title: 'Technical Support Engineer 1st Level', company: 'Beispiel GmbH' }),
  );
});

test('rechtsformen im firmennamen aendern die id nicht', () => {
  const basis = jobId({ title: 'Entwickler', company: 'Beispiel' });
  for (const firma of ['Beispiel GmbH', 'Beispiel GmbH & Co KG', 'Beispiel AG', 'Beispiel e.U.']) {
    assert.equal(jobId({ title: 'Entwickler', company: firma }), basis, firma);
  }
});

test('umlaute und scharfes s im firmennamen aendern die id nicht', () => {
  // Fuer die ID werden Diakritika entfernt (ue -> u), waehrend slugify sie ausschreibt
  // (ue -> ue). Verschiedene Zwecke: hier zaehlt nur, dass beide Schreibweisen einer
  // Firma dieselbe ID ergeben.
  assert.equal(
    jobId({ title: 'Entwickler', company: 'Grüße GmbH' }),
    jobId({ title: 'Entwickler', company: 'Grusse' }),
  );
});

test('verschiedene stellen ergeben verschiedene ids', () => {
  assert.notEqual(
    jobId({ title: 'Entwickler', company: 'Beispiel GmbH' }),
    jobId({ title: 'Entwickler', company: 'Andere GmbH' }),
  );
});

test('titel und firma lassen sich nicht ineinanderschieben', () => {
  assert.notEqual(jobId({ title: 'ab', company: 'c' }), jobId({ title: 'a', company: 'bc' }));
});
