import type { Job, ScrapedJob } from '../../scrapers/interface.ts';
import { jobId } from '../../lib/hash.ts';

/** Artificial postings throughout — no real company, no real contact address. */
export function fixtureScrapedJob(ueberschreibungen: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    source: 'karriere.at',
    url: 'https://www.karriere.at/jobs/1',
    title: 'Junior Softwareentwickler (m/w/d)',
    company: 'Beispiel GmbH',
    location: 'Wien',
    description: 'Wartung und Ausbau einer Bestellplattform.',
    postedAt: '2026-03-01',
    salary: null,
    ...ueberschreibungen,
  };
}

export function fixtureJob(ueberschreibungen: Partial<Job> = {}): Job {
  const scraped = fixtureScrapedJob(ueberschreibungen);
  const jetzt = '2026-03-02T08:00:00.000Z';
  return {
    ...scraped,
    id: jobId(scraped),
    status: 'new',
    fit: null,
    scrapedAt: jetzt,
    updatedAt: jetzt,
    ...ueberschreibungen,
  };
}
