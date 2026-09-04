import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStorage } from '../storage/index.ts';
import { dataPfad } from '../lib/pfade.ts';
import { jobBasename } from '../lib/slugify.ts';
import { fixtureJob } from './helpers/job-fixtures.ts';
import { tmpArbeitsverzeichnis } from './helpers/fixtures.ts';

test('ein gespeicherter job kommt unveraendert zurueck', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob();

  await storage.save(job);

  assert.equal(await storage.exists(job.id), true);
  assert.deepEqual(await storage.get(job.id), job);
});

test('ein unbekannter job liefert null statt zu werfen', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();

  assert.equal(await storage.get('gibtesnicht'), null);
  assert.equal(await storage.exists('gibtesnicht'), false);
});

test('die datei heisst nach titel, firma und datum, nicht nach der id', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob();

  await storage.save(job);

  const dateien = await readdir(dataPfad('jobs'));
  assert.ok(dateien.includes(`${jobBasename(job)}.json`));
  assert.ok(!dateien.includes(`${job.id}.json`), 'die Annahme ${id}.json liess einen Dedup-Check leer laufen');
});

test('getriagte jobs landen im ordner ihres fit', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob({ status: 'triaged', fit: 'matched' });

  await storage.save(job);

  assert.ok((await readdir(dataPfad('jobs', 'matched'))).length === 1);
  assert.deepEqual(await storage.get(job.id), job);
});

test('ein statuswechsel laesst keine zweite datei zurueck', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob({ status: 'triaged', fit: 'matched' });
  await storage.save(job);

  await storage.updateStatus(job.id, 'generated');

  const imFitOrdner = await readdir(dataPfad('jobs', 'matched'));
  const imBasisordner = (await readdir(dataPfad('jobs'))).filter((datei) => datei.endsWith('.json'));
  assert.deepEqual(imFitOrdner, [], 'die alte Datei muss verschwinden');
  assert.equal(imBasisordner.length, 1);
});

test('ein wechsel zwischen zwei fit-ordnern raeumt den alten', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob({ status: 'triaged', fit: 'matched' });
  await storage.save(job);

  await storage.update(job.id, { fit: 'offstack' });

  assert.deepEqual(await readdir(dataPfad('jobs', 'matched')), []);
  assert.equal((await readdir(dataPfad('jobs', 'offstack'))).length, 1);
});

test('update ergaenzt und ueberschreibt nicht den ganzen job', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob();
  await storage.save(job);

  await storage.update(job.id, { email: 'bewerbung@example.com' });
  const nachher = await storage.update(job.id, { status: 'generated' });

  assert.equal(nachher.email, 'bewerbung@example.com', 'die erste Aenderung darf nicht verloren gehen');
  assert.equal(nachher.status, 'generated');
  assert.equal(nachher.title, job.title);
  assert.notEqual(nachher.updatedAt, job.updatedAt);
});

test('update auf einen unbekannten job wirft', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();

  await assert.rejects(() => storage.update('gibtesnicht', { status: 'generated' }), /nicht gefunden/);
});

test('list findet jobs aus allen ordnern und filtert nach status', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const neu = fixtureJob();
  const getriagt = fixtureJob({ title: 'Backend-Entwickler', status: 'triaged', fit: 'brutal' });
  await storage.save(neu);
  await storage.save(getriagt);

  assert.equal((await storage.list()).length, 2);
  assert.deepEqual((await storage.list({ status: 'triaged' })).map((job) => job.title), ['Backend-Entwickler']);
});

test('eine kaputte datei laesst list nicht scheitern', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  await storage.save(fixtureJob());
  await writeFile(join(dataPfad('jobs'), 'kaputt.json'), '{ kein json', 'utf8');

  assert.equal((await storage.list()).length, 1);
});

test('temp- und punktdateien zaehlen nicht als jobs', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  await storage.save(fixtureJob());
  await writeFile(join(dataPfad('jobs'), '.gitkeep'), '', 'utf8');

  assert.equal((await storage.list()).length, 1);
});

test('beim speichern liegt nie eine halb geschriebene datei', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob();

  await storage.save(job);

  const dateien = await readdir(dataPfad('jobs'));
  assert.deepEqual(dateien.filter((datei) => datei.startsWith('.tmp-')), []);
  const inhalt = await readFile(join(dataPfad('jobs'), `${jobBasename(job)}.json`), 'utf8');
  assert.deepEqual(JSON.parse(inhalt), job);
});

test('delete entfernt den job', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  const job = fixtureJob();
  await storage.save(job);

  await storage.delete(job.id);

  assert.equal(await storage.exists(job.id), false);
  await assert.doesNotReject(() => storage.delete(job.id), 'ein zweites Loeschen ist kein Fehler');
});

test('deleteJob trifft genau eine datei, wenn zwei dieselbe id tragen', async (t) => {
  await tmpArbeitsverzeichnis(t);
  const storage = createStorage();
  // Zwei Scrapes derselben Stelle: gleiche ID, nur das Datum im Dateinamen trennt sie.
  const erst = fixtureJob({ postedAt: '2026-03-01' });
  const zweit = fixtureJob({ postedAt: '2026-04-01' });
  await storage.save(erst);
  await storage.save(zweit);

  assert.equal((await storage.list()).length, 2, 'beide Dateien liegen nebeneinander');

  await storage.deleteJob(erst);

  const uebrig = await storage.list();
  assert.equal(uebrig.length, 1);
  assert.equal(uebrig[0]?.postedAt, '2026-04-01');
});
