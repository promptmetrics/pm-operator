/**
 * SERP-safe meta description: collapse whitespace (post bodies embed raw
 * newlines, which end up verbatim in the tag), cut at a word boundary, and
 * signal the cut with an ellipsis. The previous `.slice(0, 160)` cut mid-word
 * at exactly the length Google truncates at, so snippets ended in half words.
 */
export function metaDescription(text: string, max = 155): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;

  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // No space in range means one unbroken token — hard cut is all there is.
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[\s,;:.!?—-]+$/, '')}…`;
}
