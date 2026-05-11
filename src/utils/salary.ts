// parses salary strings like "Ab 48k €", "45k - 70k €", "3.000 – 4.500 € / Monat"
// returns the minimum salary as an annual figure, or undefined if unparseable
export function parseSalaryMin(salary: string | undefined): number | undefined {
    if (!salary) return undefined;

    // find the first number in the string
    const match = salary.replace(/\./g, '').match(/(\d+)\s*k?/i);
    if (!match) return undefined;

    let value = parseInt(match[1], 10);

    // if "k" follows the number it's already in thousands
    if (/\d\s*k/i.test(salary)) {
        value = value * 1000;
    }

    // monthly salary — multiply by 14 (Austrian standard with holiday pay)
    if (/monat|month|mtl/i.test(salary)) {
        value = value * 14;
    }

    return value;
}
