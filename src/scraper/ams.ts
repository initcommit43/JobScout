import { chromium } from 'playwright';
import { Job } from '../types/Job';

export interface AmsResult {
    id: number;
    lastUpdatedAt: string;
    title: string;
    company: {
        name: string;
        address: {
            municipality: string;
            federalState: string;
        };
    };
}

export function parseAmsResult(r: AmsResult): Job {
    return {
        id: r.id.toString(),
        title: r.title,
        company: r.company?.name ?? '',
        location: r.company?.address?.municipality || r.company?.address?.federalState || 'Österreich',
        url: `https://jobs.ams.at/public/emps/jobs/${r.id}`,
        postedAt: new Date(r.lastUpdatedAt),
        source: 'ams',
    };
}

export async function scrapeAms(searchTerm: string = 'Software Engineer'): Promise<Job[]> {
    console.log(`Scraping AMS for "${searchTerm}"...`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const searchUrl = `https://jobs.ams.at/public/emps/jobs?sortField=_SCORE&sortOrder=desc&query=${encodeURIComponent(searchTerm)}&JOB_OFFER_TYPE=SB_WKO&JOB_OFFER_TYPE=IJ&JOB_OFFER_TYPE=BA&JOB_OFFER_TYPE=BZ&JOB_OFFER_TYPE=TN`;

        // navigate and race against the search API response — don't wait for full networkidle
        const [searchResponse] = await Promise.all([
            page.waitForResponse(
                res => res.url().includes('/api/search') && res.status() === 200,
                { timeout: 20000 }
            ),
            page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }),
        ]);

        const searchData: { results?: AmsResult[] } = await searchResponse.json();
        const results = searchData.results ?? [];
        console.log(`Found ${results.length} jobs`);

        return results.map(parseAmsResult);

    } catch (error) {
        console.error('AMS scraper failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}
