import { chromium } from 'playwright';
import { Job } from '../types/Job';

export function toJobProfessionSlug(term: string): string {
    return term.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

export async function scrapeDevjobs(searchTerm: string = 'software-engineer'): Promise<Job[]> {
    console.log(`Scraping devjobs.at for "${searchTerm}"...`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const slug = toJobProfessionSlug(searchTerm);
        const url = `https://www.devjobs.at/jobs/search?jobProfessions=${slug}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const hasCards = await page.$('li a[href*="/job/"]');
        if (!hasCards) {
            console.log(`devjobs.at: no results for "${searchTerm}"`);
            return [];
        }

        const jobs = await page.evaluate((): Array<{
            id: string;
            title: string;
            company: string;
            location: string;
            url: string;
            salary?: string;
        }> => {
            const cards = [...document.querySelectorAll('li')].filter(
                li => li.querySelector('a[href*="/job/"]')
            );

            return cards.map(card => {
                const link = card.querySelector('a[href*="/job/"]') as HTMLAnchorElement;
                const id = link.getAttribute('href')?.replace('/job/', '') ?? '';
                const title = card.querySelector('h2')?.textContent?.trim() ?? '';
                const company = card.querySelector('p.font-semibold')?.textContent?.trim() ?? '';
                const location = card.querySelector('span.text-dj-mono-600')?.textContent?.trim() ?? 'Österreich';

                const pills = card.querySelectorAll('ul li');
                let salary: string | undefined;
                pills.forEach(pill => {
                    if (!salary && pill.textContent?.includes('€')) {
                        salary = pill.textContent.trim();
                    }
                });

                return { id, title, company, location, url: `https://devjobs.at/job/${id}`, salary };
            });
        });

        console.log(`Found ${jobs.length} jobs`);

        return jobs.map(j => ({
            ...j,
            postedAt: new Date(),
            source: 'devjobs' as const,
        }));

    } catch (error) {
        console.error('devjobs.at scraper failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}
