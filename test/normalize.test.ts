import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJob } from '../lib/normalize.ts';
import { jobId } from '../lib/hash.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';

test('toJob setzt status new und beide zeitstempel', () => {
  const job = toJob(fixtureScrapedJob());

  assert.equal(job.status, 'new');
  assert.equal(job.fit, null);
  assert.equal(job.scrapedAt, job.updatedAt);
  assert.equal(job.id, jobId(fixtureScrapedJob()));
});

test('toJob laesst die felder der stelle unveraendert', () => {
  const scraped = fixtureScrapedJob();
  const job = toJob(scraped);

  assert.equal(job.title, scraped.title);
  assert.equal(job.company, scraped.company);
  assert.equal(job.description, scraped.description);
  assert.equal(job.url, scraped.url);
});
