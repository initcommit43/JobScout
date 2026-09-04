/**
 * Pipeline zone (scrape/filter/letter) and UI zone write different fields of the same
 * job; nothing else writes these values, which is why they are literals rather than
 * derived. 'triaged' replaces the former separate filtered_out/uncertain/matched — the
 * verdict itself lives in `fit` alone, so no second field states it in other words.
 */
export type JobStatus =
  | 'new'
  | 'triaged'
  | 'generated'
  | 'freigegeben'
  | 'postausgang'
  | 'gesendet'
  | 'geloescht'
  | 'fehler';

export type Fit = 'matched' | 'offstack' | 'brutal';

export interface ScrapedJob {
  source: string;
  url: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  postedAt?: string | null;
  salary?: string | null;
}

export interface Job extends ScrapedJob {
  id: string;
  status: JobStatus;
  fit: Fit | null;
  scrapedAt: string;
  updatedAt: string;
  email?: string | null;
  /** Only status 'fehler' refers to this. */
  error?: string | null;
  /**
   * Not its own JobStatus: updateStatus() drives the folder move, and a reply does not
   * change the application's status — it is extra information about it. Written through
   * the generic update(), like job.email.
   */
  replyReceivedAt?: string | null;
  /**
   * Every follow-up for this application, oldest first. Carries both the clock for the
   * next due follow-up and the history for the UI. 'draft' counts on purpose: a created
   * draft is "handled for now", otherwise the same job would surface again on the next
   * look and collect a second draft.
   */
  followUps?: { at: string; via: 'draft' | 'sent' }[];
  /**
   * Set at the sending site itself rather than derived from updatedAt: updatedAt is
   * rewritten by every update() — a later replyReceivedAt would destroy the send date.
   */
  sentAt?: string | null;
}

/**
 * The shape a search query has in config/sources.json. Deliberately a loose record:
 * that is how the file arrives, and a schema type here would only pretend the file was
 * checked. It is checked against querySchema — at the boundary, not in the type system.
 */
export type SourceQuery = Record<string, string>;

/**
 * How a single field is treated before it reaches the portal.
 *   'slug'   — used as a URL path segment (karriere.at, jobs.at); searchSlug normalises.
 *   'text'   — goes verbatim into a query parameter (linkedin, ams). A slug entered
 *              here would literally be searched with its hyphens.
 *   'number' — a number as a string (ams vicinity, in km).
 *   'raw'    — a finished query string, appended unchanged (devjobs.at).
 */
export type QueryFieldFormat = 'slug' | 'text' | 'number' | 'raw';

export interface QueryField {
  key: string;
  label: string;
  required: boolean;
  format: QueryFieldFormat;
  placeholder?: string;
}

export interface ScraperAdapter {
  name: string;
  kind: 'fetch' | 'browser';
  /**
   * Which fields a query for this portal may have. Mandatory, so an adapter without a
   * schema does not compile — the settings page builds its form from it and
   * query-schema.ts checks the config file against it.
   */
  querySchema: QueryField[];
  scrape(
    queries: SourceQuery[],
    keep?: (job: ScrapedJob) => boolean,
    onProgress?: (current: number, total: number) => void,
    /**
     * One finished row of found jobs, for the progress grid. For sources with real
     * result pagination that is a page; for the others a fixed batch from the detail
     * fetch (see lib/grid-batch.ts).
     */
    onUnitDone?: (items: ScrapedJob[]) => void,
  ): Promise<ScrapedJob[]>;
}
