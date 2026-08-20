// Post slugs are capped at 60 chars. The cap used to be a bare `.slice(0, 60)`
// applied after the trailing-dash trim, so long titles were cut mid-word and
// kept the dash the trim had just removed — a live post is still parked at
// `.../agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-`.
//
// Pure function, no DB, so this runs anywhere.
//
// Note: the `slugify` exported from ./helpers is a different thing entirely (a
// test-fixture name generator). This imports the real one from the posts service.
import { describe, expect, test } from 'vitest';

import { slugify } from '../lib/services/posts';

const MAX = 60;

describe('slugify', () => {
  test('leaves short titles alone', () => {
    expect(slugify('Agent powered HubSpot cleanup')).toBe('agent-powered-hubspot-cleanup');
  });

  test('never ends in a hyphen', () => {
    const titles = [
      'Agent-powered HubSpot cleanup, with a human approval gate on every write',
      'Is your org chart still built for a relay race that does not exist',
      'When was the last time you did something for the first time, really',
      'a'.repeat(59) + ' b',
      'Trailing punctuation!!!',
      'Hyphen at the cut ------------------------------------------------ here',
    ];
    for (const title of titles) {
      expect(slugify(title), title).not.toMatch(/-$/);
    }
  });

  test('does not split a word', () => {
    // The regression case, verbatim from the live post.
    const slug = slugify(
      'Agent-powered HubSpot cleanup, with a human approval gate on every write'
    );
    expect(slug).toBe('agent-powered-hubspot-cleanup-with-a-human-approval-gate-on');
    expect(slug.endsWith('-on')).toBe(true);
    // 'every' must not survive as a fragment.
    expect(slug).not.toMatch(/ever$/);
  });

  test('respects the 60-character cap', () => {
    const long = 'word '.repeat(40);
    expect(slugify(long).length).toBeLessThanOrEqual(MAX);
  });

  test('a single word longer than the cap truncates rather than vanishing', () => {
    const slug = slugify('a'.repeat(80));
    expect(slug).toBe('a'.repeat(MAX));
    expect(slug).not.toBe('');
  });

  test('non-ASCII titles collapse to empty so the caller can fall back', () => {
    // uniquePostSlug turns '' into 'post'; slugify itself is ASCII-only.
    expect(slugify('日本語のタイトル')).toBe('');
    expect(slugify('🎉🎉🎉')).toBe('');
  });

  test('produces only URL-safe characters', () => {
    const slug = slugify('Réal "quotes" & things — 100% wild/slashes?');
    expect(slug).toMatch(/^[a-z0-9-]*$/);
    expect(slug).not.toMatch(/^-|-$/);
  });
});
