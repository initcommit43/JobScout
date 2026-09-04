/**
 * Shared batch collector for scrapers without real result pagination (karriere.at,
 * jobs.at). Groups the job-by-job detail fetch into fixed blocks so onUnitDone carries
 * the same "one row per unit" meaning as the genuinely paginated sources.
 */
export function createBatcher<T>(
  groesse: number,
  onUnitDone?: (items: T[]) => void,
): { push: (item: T) => void; flush: () => void } {
  let puffer: T[] = [];

  function flush(): void {
    if (puffer.length === 0) return;
    onUnitDone?.(puffer);
    puffer = [];
  }

  function push(item: T): void {
    puffer.push(item);
    if (puffer.length >= groesse) flush();
  }

  return { push, flush };
}
