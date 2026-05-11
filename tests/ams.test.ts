import { parseAmsResult, AmsResult } from '../src/scraper/ams';

const base: AmsResult = {
    id: 22025446,
    lastUpdatedAt: '2026-05-08T00:00:00Z',
    title: 'Software Engineer',
    company: {
        name: 'AGILOX Services GmbH',
        address: {
            municipality: 'Neukirchen bei Lambach',
            federalState: 'Oberösterreich',
        },
    },
};

describe('parseAmsResult', () => {

    test('maps id to string', () => {
        expect(parseAmsResult(base).id).toBe('22025446');
    });

    test('maps title and company name', () => {
        const job = parseAmsResult(base);
        expect(job.title).toBe('Software Engineer');
        expect(job.company).toBe('AGILOX Services GmbH');
    });

    test('prefers municipality over federalState for location', () => {
        expect(parseAmsResult(base).location).toBe('Neukirchen bei Lambach');
    });

    test('falls back to federalState when municipality is missing', () => {
        const r: AmsResult = {
            ...base,
            company: { ...base.company, address: { municipality: '', federalState: 'Steiermark' } },
        };
        expect(parseAmsResult(r).location).toBe('Steiermark');
    });

    test('falls back to "Österreich" when both address fields are missing', () => {
        const r: AmsResult = {
            ...base,
            company: { ...base.company, address: { municipality: '', federalState: '' } },
        };
        expect(parseAmsResult(r).location).toBe('Österreich');
    });

    test('builds correct job URL', () => {
        expect(parseAmsResult(base).url).toBe('https://jobs.ams.at/public/emps/jobs/22025446');
    });

    test('parses lastUpdatedAt into a Date', () => {
        const job = parseAmsResult(base);
        expect(job.postedAt).toBeInstanceOf(Date);
        expect(job.postedAt.toISOString()).toBe('2026-05-08T00:00:00.000Z');
    });

    test('source is always ams', () => {
        expect(parseAmsResult(base).source).toBe('ams');
    });
});
