const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeNumericEntity(hex: string | undefined, decimal: string | undefined): string {
  const code = hex
    ? parseInt(hex, 16)
    : decimal
      ? parseInt(decimal, 10)
      : NaN;
  return Number.isNaN(code) ? '' : String.fromCodePoint(code);
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&([a-z][a-z0-9]*);/gi, (_, name) => NAMED_ENTITIES[name.toLowerCase()] ?? `&${name};`)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeNumericEntity(hex, undefined))
    .replace(/&#(\d+);/g, (_, decimal) => decodeNumericEntity(undefined, decimal));
}

export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n\s*\n/g, '\n')
    .trim();
}
