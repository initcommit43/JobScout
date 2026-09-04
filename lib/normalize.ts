import type { Job, ScrapedJob } from '../scrapers/interface.ts';
import { jobId } from './hash.ts';

export function toJob(scraped: ScrapedJob): Job {
  const jetzt = new Date().toISOString();
  return { ...scraped, id: jobId(scraped), status: 'new', fit: null, scrapedAt: jetzt, updatedAt: jetzt };
}
