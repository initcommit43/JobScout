import { parseLinkedinJob, LinkedinRawJob } from '../src/scraper/linkedin';

const base: LinkedinRawJob = {
    id: '4407622458',
    title: 'Software Engineer Frontend',
    company: 'Doppelmayr Official',
    location: 'Wien, Wien, Österreich',
    url: 'https://at.linkedin.com/jobs/view/software-engineer-frontend-at-doppelmayr-official-4407622458',
    postedAt: '2026-04-30',
};

describe('parseLinkedinJob', () => {

    test('passes id, title, company, location and url through unchanged', () => {
        const job = parseLinkedinJob(base);
        expect(job.id).toBe('4407622458');
        expect(job.title).toBe('Software Engineer Frontend');
        expect(job.company).toBe('Doppelmayr Official');
        expect(job.location).toBe('Wien, Wien, Österreich');
        expect(job.url).toBe(base.url);
    });

    test('parses ISO date string into a Date', () => {
        const job = parseLinkedinJob(base);
        expect(job.postedAt).toBeInstanceOf(Date);
        expect(job.postedAt.toISOString().startsWith('2026-04-30')).toBe(true);
    });

    test('falls back to current date when postedAt is empty', () => {
        const before = Date.now();
        const job = parseLinkedinJob({ ...base, postedAt: '' });
        expect(job.postedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    test('source is always linkedin', () => {
        expect(parseLinkedinJob(base).source).toBe('linkedin');
    });
});
