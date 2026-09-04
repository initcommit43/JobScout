const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export interface SeitenAntwort {
  ok: boolean;
  status: number;
  html: string;
}

/**
 * Never throws: a portal being down is an expected outcome of a scrape, not an
 * exception. Callers decide what a failed page means for their run.
 */
export async function fetchPage(url: string): Promise<SeitenAntwort> {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), 15_000);
  try {
    const antwort = await fetch(url, {
      signal: abbruch.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'de-AT,de;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = antwort.ok ? await antwort.text() : '';
    return { ok: antwort.ok, status: antwort.status, html };
  } catch {
    return { ok: false, status: 0, html: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Throttles detail fetches. Protects against being blocked, not just from politeness. */
export const sleep = (ms: number): Promise<void> => new Promise((fertig) => setTimeout(fertig, ms));
