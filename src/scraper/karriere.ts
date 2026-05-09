import { chromium } from 'playwright';
import { Job } from '../types/Job';

interface RawJobData {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    dateText: string; // karriere.at uses "vor 3 Tagen" not an ISO date
    salary?: string;
}

// karriere.at doesn't give us real dates, just relative strings
export function parseRelativeDate(text: string): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lower = text.toLowerCase();

    if (lower.includes('heute') || lower.includes('gerade')) {
        return today;
    }

    if (lower.includes('gestern')) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
    }

    const match = lower.match(/vor (\d+) tag/);
    if (match) {
        const daysAgo = parseInt(match[1], 10);
        const result = new Date(today);
        result.setDate(result.getDate() - daysAgo);
        return result;
    }

    // fallback if the format ever changes
    return today;
}

export function parseRawJob(raw: RawJobData): Job {
    return {
        id: raw.id,
        title: raw.title.trim(),
        company: raw.company.trim(),
        location: raw.location.trim(),
        url: raw.url,
        salary: raw.salary,
        postedAt: parseRelativeDate(raw.dateText),
        source: 'karriere',
    };
}

// selectors might break if karriere.at redesigns - verify against live DOM if jobs stop showing up
export async function scrapeKarriere(searchTerm: string = 'developer'): Promise<Job[]> {
    console.log(`Scraping karriere.at for "${searchTerm}"...`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const url = `https://www.karriere.at/jobs/${encodeURIComponent(searchTerm)}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('li.m-jobsList__item[data-gtm-item-type="job"]', { timeout: 15000 });

        // page.evaluate runs inside the browser - no Node.js stuff available in here
        const rawJobs = await page.evaluate((): RawJobData[] => {
            const cards = document.querySelectorAll('li.m-jobsList__item[data-gtm-item-type="job"]');
            const results: RawJobData[] = [];

            // go through each card and pull out what we need
            cards.forEach(card => {
                const id = card.getAttribute('data-gtm-item-id') || '';
                const titleLink = card.querySelector('a.m-jobsListItem__titleLink') as HTMLAnchorElement | null;
                const companyEl = card.querySelector('a.m-jobsListItem__companyName');
                const locationEl = card.querySelector('.m-jobsListItem__location');
                const dateEl = card.querySelector('span.m-jobsListItem__date');

                // salary has no dedicated class - it's just the pill that contains €
                const pills = card.querySelectorAll('.m-jobsListItem__pill');
                let salary: string | undefined;
                pills.forEach(pill => {
                    if (pill.textContent?.includes('€')) {
                        salary = pill.textContent.trim();
                    }
                });

                if (!titleLink || !companyEl) return;

                results.push({
                    id,
                    title: titleLink.textContent?.trim() || '',
                    company: companyEl.textContent?.trim() || '',
                    location: locationEl?.textContent?.trim() || 'Österreich',
                    url: titleLink.href,
                    dateText: dateEl?.textContent?.trim() || 'heute',
                    salary,
                });
            });

            return results;
        });

        console.log(`Found ${rawJobs.length} jobs`);

        // TODO: pagination
        return rawJobs.map(raw => parseRawJob(raw));

    } catch (error) {
        console.error('karriere.at scraper failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}
