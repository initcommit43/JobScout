import { chromium, Page } from 'playwright';
import { Job } from '../types/Job';
import { parseSalaryMin } from '../utils/salary';

const LEVELS = ['junior', 'mid-level', 'mid', 'senior', 'lead', 'expert', 'intern', 'principal'];
const EMPLOYMENT_TYPES = ['vollzeit', 'teilzeit', 'hybrid', 'remote', 'freelance', 'praktikum'];

export function toJobProfessionSlug(term: string): string {
    return term.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// uses the search modal autocomplete to resolve a free-text term to a devjobs profession slug
async function resolveSlug(page: Page, searchTerm: string): Promise<string | null> {
    await page.goto('https://www.devjobs.at/jobs/search', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.click('button[aria-label="Öffne Suche"]');
    await page.waitForTimeout(800);

    const input = page.locator('input[placeholder="TechStack, Beruf, Ort..."]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.type(searchTerm, { delay: 60 });
    await page.waitForTimeout(1500);

    // match on individual words so "backend" matches "Back End Developer"
    const suggestion = await page.evaluate((term: string) => {
        const options = [...document.querySelectorAll('[role="option"]')] as HTMLElement[];
        const texts = options.map(o => o.textContent?.trim() ?? '');
        const words = term.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const full    = texts.find(t => t.toLowerCase().includes(term.toLowerCase()));
        const partial = texts.find(t => words.every(w => t.toLowerCase().includes(w)));
        const any     = texts.find(t => words.some(w => t.toLowerCase().includes(w)));
        return full ?? partial ?? any ?? null;
    }, searchTerm);

    if (!suggestion) return null;

    // click the matching option then submit
    await page.locator(`[role="option"]:has-text("${suggestion}")`).first().click();
    await page.waitForTimeout(800);
    await page.locator('#headlessui-portal-root button:has-text("Jobs anzeigen")').click();
    await page.waitForTimeout(3000);

    // extract the jobProfessions slug from the resulting URL
    const url = new URL(page.url());
    return url.searchParams.get('jobProfessions');
}

async function scrapeJobCards(page: Page): Promise<Array<{
    id: string; title: string; company: string;
    location: string; url: string; salary?: string; pillTexts: string[];
}>> {
    return page.evaluate(() => {
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
                if (!salary && pill.textContent?.includes('€')) salary = pill.textContent.trim();
            });
            return { id, title, company, location, url: `https://devjobs.at/job/${id}`, salary,
            pillTexts: [...pills].map(p => p.textContent?.trim() ?? '') };
        });
    });
}

export async function scrapeDevjobs(searchTerm: string = 'software-engineer', location?: string): Promise<Job[]> {
    console.log(`Scraping devjobs.at for "${searchTerm}"...`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // first try the direct slug URL
        const directSlug = toJobProfessionSlug(searchTerm);
        const locationParam = location ? `&location=${encodeURIComponent(location.toLowerCase())}` : '';
        await page.goto(`https://www.devjobs.at/jobs/search?jobProfessions=${directSlug}${locationParam}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);

        let hasCards = await page.$('li a[href*="/job/"]');

        // if no results, use the autocomplete to resolve a valid slug
        if (!hasCards) {
            console.log(`devjobs.at: "${directSlug}" not a valid slug, trying autocomplete...`);
            const resolvedSlug = await resolveSlug(page, searchTerm);

            if (!resolvedSlug) {
                console.log(`devjobs.at: no profession match found for "${searchTerm}"`);
                return [];
            }

            console.log(`devjobs.at: resolved to slug "${resolvedSlug}"`);
            await page.goto(`https://www.devjobs.at/jobs/search?jobProfessions=${resolvedSlug}${locationParam}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);
            hasCards = await page.$('li a[href*="/job/"]');
        }

        if (!hasCards) return [];

        const jobs = await scrapeJobCards(page);
        console.log(`Found ${jobs.length} jobs`);

        return jobs.map(j => {
            const level = j.pillTexts.find(t => LEVELS.includes(t.toLowerCase()));
            const employmentType = j.pillTexts.find(t => EMPLOYMENT_TYPES.includes(t.toLowerCase()));
            return {
                id: j.id, title: j.title, company: j.company,
                location: j.location, url: j.url,
                salary: j.salary,
                salaryMin: parseSalaryMin(j.salary),
                level,
                employmentType,
                postedAt: new Date(),
                source: 'devjobs' as const,
            };
        });

    } catch (error) {
        console.error('devjobs.at scraper failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}
