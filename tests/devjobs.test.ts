import { toJobProfessionSlug } from '../src/scraper/devjobs';

describe('toJobProfessionSlug', () => {

    test('lowercases and hyphenates a normal job title', () => {
        expect(toJobProfessionSlug('Software Engineer')).toBe('software-engineer');
    });

    test('trims leading and trailing whitespace', () => {
        expect(toJobProfessionSlug('  Frontend Developer  ')).toBe('frontend-developer');
    });

    test('collapses multiple spaces into a single hyphen', () => {
        expect(toJobProfessionSlug('Full  Stack  Developer')).toBe('full-stack-developer');
    });

    test('removes leading and trailing hyphens', () => {
        expect(toJobProfessionSlug('-backend-')).toBe('backend');
    });

    test('handles already lowercase single word', () => {
        expect(toJobProfessionSlug('devops')).toBe('devops');
    });

    test('strips special characters', () => {
        expect(toJobProfessionSlug('IT & Support')).toBe('it-support');
    });
});
