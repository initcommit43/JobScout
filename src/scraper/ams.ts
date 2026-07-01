import { chromium, Page } from 'playwright';
import { Job } from '../types/Job';
import { parseSalaryMin } from '../utils/salary';

interface LocationSuggestion {
    locationId: string;
}

// AMS needs an internal locationId (not the free-text city name) to actually filter —
// resolved via the same autocomplete endpoint the site's own search box uses.
// Runs inside the page (not a bare fetch) so it shares the browser's session/fingerprint,
// otherwise the API responds 401 UNAUTHORIZED.
async function resolveLocationId(page: Page, locationText: string): Promise<string | null> {
    await page.goto('https://jobs.ams.at/public/emps/jobs', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const suggestion: LocationSuggestion | null = await page.evaluate(async (text) => {
        const res = await fetch(`/public/emps/api/suggestions/location?text=${encodeURIComponent(text)}&pageSize=1`);
        if (!res.ok) return null;
        const data = await res.json();
        return data[0] ?? null;
    }, locationText);
    return suggestion?.locationId ?? null;
}

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
        let locationParam = '';
        if (location) {
            const locationId = await resolveLocationId(page, location);
            if (locationId) {
                locationParam = `&location=${encodeURIComponent(location)}&locationId=${locationId}&vicinity=20`;
            } else {
                console.warn(`AMS: Ort "${location}" nicht gefunden, Location-Filter wird ignoriert`);
            }
        }
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
