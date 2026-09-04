import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  devJobsAtAdapter,
  parseDetailResult,
  parseSearchResults,
  totalPagesFromContext,
} from '../scrapers/devjobs-at.ts';
import { fixtureJson } from './helpers/fixture-datei.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';

test('der remix-kontext der suche liefert stellen', async () => {
  const jobs = parseSearchResults(await fixtureJson('devjobs-at', 'search-remix-context.json'));

  assert.ok(jobs.length > 0);
  for (const job of jobs) {
    assert.equal(job.source, 'devjobs.at');
    assert.match(job.url, /^https:\/\/www\.devjobs\.at\/job\//);
    assert.ok(job.title.length > 0);
    assert.ok(job.company.length > 0);
    assert.ok((job.location ?? '').length > 0);
  }
});

test('ein gehaltsband wird nur bei beiden grenzen gebildet', async () => {
  const jobs = parseSearchResults(await fixtureJson('devjobs-at', 'search-remix-context.json'));

  for (const job of jobs) {
    if (job.salary !== null && job.salary !== undefined) {
      assert.match(job.salary, /^\d+–\d+ €\/Jahr$/, job.salary);
    }
  }
});

test('unvollstaendige eintraege werden uebersprungen statt halb uebernommen', () => {
  const kontext = {
    state: {
      loaderData: {
        'routes/jobs/$canonical': {
          activeJobs: [
            { model: { metaJobTitle: { title: 'Entwickler' }, company: { title: 'Beispiel' } } }, // kein slug
            { model: { slug: 'ohne-titel', company: { title: 'Beispiel' } } },
            { model: { metaJobTitle: { title: 'Voll' }, company: { title: 'Beispiel' }, slug: 'voll' } },
          ],
        },
      },
    },
  };

  const jobs = parseSearchResults(kontext);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.title, 'Voll');
});

test('ein fremder oder leerer kontext ergibt eine leere liste', () => {
  assert.deepEqual(parseSearchResults(null), []);
  assert.deepEqual(parseSearchResults({}), []);
  assert.deepEqual(parseSearchResults({ state: { loaderData: {} } }), []);
});

test('die seitenzahl kommt aus dem kontext, sonst eins', async () => {
  const kontext = await fixtureJson('devjobs-at', 'search-remix-context.json');

  assert.ok(totalPagesFromContext(kontext) >= 1);
  assert.equal(totalPagesFromContext(null), 1);
  assert.equal(totalPagesFromContext({ state: { loaderData: {} } }), 1);
});

test('die detailseite ergaenzt die volle beschreibung', async () => {
  const basis = fixtureScrapedJob({ source: 'devjobs.at', description: 'Anriss', postedAt: null });
  const job = parseDetailResult(await fixtureJson('devjobs-at', 'detail-remix-context.json'), basis);

  assert.ok(job.description.length > basis.description.length);
  assert.doesNotMatch(job.description, /<[a-z]/i);
  assert.equal(job.company, basis.company, 'uebrige Felder bleiben stehen');
});

test('ohne job im kontext bleibt der basis-job unveraendert', () => {
  const basis = fixtureScrapedJob({ source: 'devjobs.at' });

  assert.deepEqual(parseDetailResult({ state: { loaderData: {} } }, basis), basis);
  assert.deepEqual(parseDetailResult(null, basis), basis);
});

test('devjobs.at filtert ueber einen fertigen query-string', () => {
  assert.equal(devJobsAtAdapter.kind, 'browser');

  const params = devJobsAtAdapter.querySchema.find((feld) => feld.key === 'params');
  assert.equal(params?.required, true);
  assert.equal(params?.format, 'raw', 'der Wert wird unveraendert an die URL gehaengt');
  assert.equal(devJobsAtAdapter.querySchema.length, 1, 'das einzige Portal ohne Suchbegriff');
});
