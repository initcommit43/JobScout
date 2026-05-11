import https from 'https';
import { chromium } from 'playwright';
import { Job } from '../types/Job';

function fetchHtml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8',
            }
        }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                resolve(fetchHtml(res.headers.location));
                return;
            }
            let data = '';
            res.on('data', (chunk: Buffer) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

export interface LinkedinRawJob {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    postedAt: string; // ISO date string from datetime attribute, e.g. "2026-05-04"
}

export function parseLinkedinJob(raw: LinkedinRawJob): Job {
    return {
        id: raw.id,
        title: raw.title,
        company: raw.company,
        location: raw.location,
        url: raw.url,
        postedAt: raw.postedAt ? new Date(raw.postedAt) : new Date(),
        source: 'linkedin',
    };
}

export async function scrapeLinkedin(searchTerm: string = 'software engineer'): Promise<Job[]> {
    console.log(`Scraping LinkedIn for "${searchTerm}"...`);

    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(searchTerm)}&location=Austria&start=0`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const html = await fetchHtml(url);

        if (!html || html.length < 100) {
            console.log('LinkedIn: empty or blocked response');
            return [];
        }

        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const jobs = await page.evaluate((): Array<{
            id: string;
            title: string;
            company: string;
            location: string;
            url: string;
            postedAt: string;
        }> => {
            const cards = document.querySelectorAll('div.base-card');
            const results: Array<{
                id: string; title: string; company: string;
                location: string; url: string; postedAt: string;
            }> = [];

            cards.forEach(card => {
                const urn = card.getAttribute('data-entity-urn') ?? '';
                const id = urn.replace('urn:li:jobPosting:', '');

                const link = card.querySelector('a.base-card__full-link') as HTMLAnchorElement | null;
                const title = card.querySelector('h3.base-search-card__title')?.textContent?.trim() ?? '';
                const company = card.querySelector('h4.base-search-card__subtitle a')?.textContent?.trim() ?? '';
                const location = card.querySelector('span.job-search-card__location')?.textContent?.trim() ?? '';
                const datetime = card.querySelector('time.job-search-card__listdate')?.getAttribute('datetime') ?? '';

                if (!id || !title) return;

                results.push({ id, title, company, location, url: link?.href ?? '', postedAt: datetime });
            });

            return results;
        });

        console.log(`Found ${jobs.length} jobs`);

        return jobs.map(parseLinkedinJob);

    } catch (error) {
        console.error('LinkedIn scraper failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}
