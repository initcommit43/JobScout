import { chromium } from 'playwright';
import { Job } from '../types/Job';
import { parseSalaryMin } from '../utils/salary';

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
    workingTime?: { description: string };
    salaryInfo?: { minValue?: number; maxValue?: number; currency?: string };
}

export function parseAmsResult(r: AmsResult): Job {
    const salaryMin = r.salaryInfo?.minValue
        ? r.salaryInfo.minValue * 14  // monthly → annual
        : undefined;

    const salaryStr = r.salaryInfo?.minValue
        ? `ab ${r.salaryInfo.minValue.toLocaleString('de-AT')} € / Monat`
        : undefined;

    return {
        id: r.id.toString(),
        title: r.title,
        company: r.company?.name ?? '',
        location: r.company?.address?.municipality || r.company?.address?.federalState || 'Österreich',
        url: `https://jobs.ams.at/public/emps/jobs/${r.id}`,
        salary: salaryStr,
        salaryMin,
        employmentType: r.workingTime?.description,
        postedAt: new Date(r.lastUpdatedAt),
        source: 'ams',
    };
}

export async function scrapeAms(searchTerm: string = 'Software Engineer', location?: string): Promise<Job[]> {
    console.log(`Scraping AMS for "${searchTerm}"${location ? ` in "${location}"` : ''}...`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const locationParam = location ? `&location=${encodeURIComponent(location)}` : '';
        const searchUrl = `https://jobs.ams.at/public/emps/jobs?sortField=_SCORE&sortOrder=desc&query=${encodeURIComponent(searchTerm)}&pageSize=25${locationParam}&JOB_OFFER_TYPE=SB_WKO&JOB_OFFER_TYPE=IJ&JOB_OFFER_TYPE=BA&JOB_OFFER_TYPE=BZ&JOB_OFFER_TYPE=TN`;

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
