import type { Job, JobStatus } from '../scrapers/interface.ts';
import { JsonStore } from './json-store.ts';

/**
 * The only place that touches data/jobs/*.json. Everything else goes through this
 * interface, which is what keeps a later move to SQLite from reaching every caller.
 */
export interface Storage {
  exists(id: string): Promise<boolean>;
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  list(filter?: { status?: JobStatus }): Promise<Job[]>;
  update(id: string, patch: Partial<Job>): Promise<Job>;
  updateStatus(id: string, status: JobStatus): Promise<Job>;
  delete(id: string): Promise<void>;
  /**
   * Deletes exactly THIS job object, not by id prefix like delete() — needed as soon as
   * two files carry the same id (a genuine re-scrape of the same posting).
   */
  deleteJob(job: Job): Promise<void>;
}

export function createStorage(basisVerzeichnis?: string): Storage {
  return new JsonStore(basisVerzeichnis);
}
