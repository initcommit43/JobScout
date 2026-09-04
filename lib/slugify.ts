function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** For file names: shortened, because paths have a limit. */
export function slugify(text: string): string {
  const slug = normalize(text);
  return slug.length > 40 ? slug.slice(0, 40).replace(/-+$/, '') : slug;
}

/**
 * For search URLs (karriere.at /jobs/<slug>, jobs.at /j/<slug>): identical, but WITHOUT
 * the cut. The 40-character limit is a file-system concern and would silently truncate a
 * long search term ("junior fullstack javascript typescript entwickler").
 *
 * Both portals used to have their own variant. Measured, the difference is inconsequential
 * (karriere.at returns the same 630+ hits for "bürokauffrau" and "buerokauffrau"), but two
 * functions meant two format names in querySchema for something users see as one thing.
 */
export function searchSlug(text: string): string {
  return normalize(text);
}

/**
 * The name a job file gets. NEVER `${id}.json` — assuming that shape once let a dedup
 * check run empty for months.
 */
export function jobBasename(job: {
  title: string;
  company: string;
  postedAt?: string | null;
  scrapedAt: string;
  id: string;
}): string {
  const datum = (job.postedAt ?? job.scrapedAt).slice(0, 10);
  return `${slugify(job.title)}_${slugify(job.company)}_${datum}_${job.id.slice(0, 8)}`;
}
