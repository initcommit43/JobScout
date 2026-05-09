import { parseRelativeDate, parseRawJob } from '../src/scraper/karriere';

describe('parseRelativeDate', () => {

    function toDateString(d: Date) {
        return d.toISOString().split('T')[0];
    }

    function daysAgo(n: number) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - n);
        return toDateString(d);
    }

    test('returns today for "heute"', () => {
        expect(toDateString(parseRelativeDate('heute veröffentlicht'))).toBe(daysAgo(0));
    });

    test('returns yesterday for "gestern"', () => {
        expect(toDateString(parseRelativeDate('gestern veröffentlicht'))).toBe(daysAgo(1));
    });

    test('handles "vor X Tagen"', () => {
        expect(toDateString(parseRelativeDate('vor 3 Tagen veröffentlicht'))).toBe(daysAgo(3));
    });

    test('falls back to today for unrecognized text', () => {
        expect(toDateString(parseRelativeDate('some weird string'))).toBe(daysAgo(0));
    });
});

describe('parseRawJob', () => {

    const validRaw = {
        id: '12345',
        title: '  Senior TypeScript Developer  ',
        company: '  Acme GmbH  ',
        location: 'Wien',
        url: 'https://www.karriere.at/jobs/12345',
        dateText: 'vor 2 Tagen veröffentlicht',
    };

    test('trims whitespace from title and company', () => {
        const job = parseRawJob(validRaw);
        expect(job.title).toBe('Senior TypeScript Developer');
        expect(job.company).toBe('Acme GmbH');
    });

    test('source is always karriere', () => {
        expect(parseRawJob(validRaw).source).toBe('karriere');
    });

    test('passes id through from raw data', () => {
        expect(parseRawJob(validRaw).id).toBe('12345');
    });

    test('salary is undefined when not provided', () => {
        expect(parseRawJob(validRaw).salary).toBeUndefined();
    });

    test('includes salary when provided', () => {
        const job = parseRawJob({ ...validRaw, salary: '3.000 – 4.500 € / Monat' });
        expect(job.salary).toBe('3.000 – 4.500 € / Monat');
    });
});
