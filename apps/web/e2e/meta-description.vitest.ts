// Meta description truncation (audit item 9). Pure function, no DB.
//
// What it pins:
//   - newlines from post bodies never reach the tag
//   - the cut lands on a word boundary with an ellipsis, never mid-word
//   - short inputs pass through untouched (no gratuitous ellipsis)
import { describe, expect, test } from 'vitest';

import { metaDescription } from '../lib/seo/meta-description';

describe('metaDescription', () => {
  test('short input passes through unchanged', () => {
    expect(metaDescription('A short description.')).toBe('A short description.');
  });

  test('collapses newlines and repeated whitespace', () => {
    expect(metaDescription('line one\n\nline two\t line three')).toBe(
      'line one line two line three'
    );
  });

  test('long input cuts at a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const out = metaDescription(words);
    expect(out.length).toBeLessThanOrEqual(156); // 155 + ellipsis
    expect(out.endsWith('…')).toBe(true);
    // The character before the ellipsis completes a word — never a cut token.
    const body = out.slice(0, -1);
    expect(words.startsWith(body)).toBe(true);
    expect(words[body.length]).toBe(' ');
  });

  test('strips trailing punctuation left at the cut', () => {
    // Collapsed layout puts "bb," right before the cut's last space, so the
    // word-boundary trim leaves a trailing comma for the strip to remove.
    const text = `${'a'.repeat(145)} bb, ${'c'.repeat(40)}`;
    const out = metaDescription(text);
    expect(out.endsWith('bb…')).toBe(true);
    expect(out.endsWith(',…')).toBe(false);
  });

  test('single unbroken token falls back to a hard cut', () => {
    const out = metaDescription('x'.repeat(400));
    expect(out.length).toBe(156);
    expect(out.endsWith('…')).toBe(true);
  });

  test('never contains a newline (item 9 acceptance)', () => {
    const out = metaDescription(`first paragraph\nsecond paragraph ${'pad '.repeat(60)}`);
    expect(out).not.toMatch(/[\n\r]/);
  });
});
