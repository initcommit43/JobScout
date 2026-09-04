import type { ScraperAdapter } from './interface.ts';
import { amsAdapter } from './ams.ts';
import { devJobsAtAdapter } from './devjobs-at.ts';
import { jobsAtAdapter } from './jobs-at.ts';
import { karriereAtAdapter } from './karriere-at.ts';
import { linkedinAdapter } from './linkedin.ts';

/** Every portal the tool knows, keyed by the name used in config/sources.json. */
export const SCRAPER_REGISTRY: Record<string, ScraperAdapter> = {
  [karriereAtAdapter.name]: karriereAtAdapter,
  [jobsAtAdapter.name]: jobsAtAdapter,
  [amsAdapter.name]: amsAdapter,
  [devJobsAtAdapter.name]: devJobsAtAdapter,
  [linkedinAdapter.name]: linkedinAdapter,
};

export const SCRAPER_NAMEN = Object.keys(SCRAPER_REGISTRY);
