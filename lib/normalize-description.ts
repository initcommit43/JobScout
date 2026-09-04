const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const HEADING_RE = /<h[1-6](?:\s[^<>]*)?\s*\/?>/gi;
const LIST_ITEM_RE = /<li(?:\s[^<>]*)?\s*\/?>/gi;
const BLOCK_BREAK_RE = /<(?:br|p|div|ul|ol)(?:\s[^<>]*)?\s*\/?>/gi;
// Opening OR closing, and tolerant of a missing final ">" at the end of the string
// (a truncated "</ul" from a broken scrape).
const ANY_TAG_RE = /<\/?[a-zA-Z][^<>]*>?/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

/**
 * Exactly ONE pass over the text — .replace() does not rescan its own output, so
 * "&amp;amp;" becomes "&amp;" (one level defused) instead of "&".
 */
function decodeEntitiesOnce(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (treffer, code: string) => {
    if (code.startsWith('#')) {
      const hex = code[1]?.toLowerCase() === 'x';
      const zahl = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(zahl) ? String.fromCodePoint(zahl) : treffer;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? treffer;
  });
}

export function normalizeDescription(html: string): string {
  let text = html;

  // (a) drop script/style including their content
  text = text.replace(SCRIPT_STYLE_RE, '');

  // (b) translate structure into text markers — opening tags only; closing tags simply
  // fall away in (c), which is enough for running text
  text = text.replace(HEADING_RE, '\n\n## ');
  text = text.replace(LIST_ITEM_RE, '\n- ');
  text = text.replace(BLOCK_BREAK_RE, '\n');

  // (c) strip remaining tags, including truncated ones such as "</ul" without ">"
  text = text.replace(ANY_TAG_RE, '');

  // (d) decode entities EXACTLY ONCE and only AFTER stripping, otherwise
  // "&lt;script&gt;" would turn back into real markup
  text = decodeEntitiesOnce(text);

  // (e) trim lines, collapse 3+ blank lines into 2
  text = text
    .split('\n')
    .map((zeile) => zeile.trim())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
