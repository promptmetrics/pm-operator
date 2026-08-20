// DiscussionForumPosting markup for community posts. No DB, no network — pure
// function, so this runs anywhere.
//
// What it pins:
//   - the properties Google requires for forum results (author, author.name,
//     datePublished, and one of text/image/video)
//   - `text` never carries HTML, because HTML in `text` is invalid and
//     post.content is the tempting wrong field to reach for
//   - no schema at all for a redacted post, so a moderator placeholder never
//     claims content the page does not show
//   - `</script>` in a post body cannot break out of the script tag
import { describe, expect, test } from 'vitest';
import type { PostDetail } from '@pm-operator/api';

import { buildPostJsonLd, serializeJsonLd } from '../lib/seo/post-jsonld';

const CANONICAL = 'https://operator.example.com/g/example-circle/example-post';

function makePost(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'example-post',
    groupId: '00000000-0000-4000-8000-000000000002',
    authorId: '00000000-0000-4000-8000-000000000003',
    title: 'Example post',
    content: '<p>Example <strong>body</strong></p>',
    contentPlain: 'Example body',
    coverImageUrl: null,
    linkPreview: null,
    type: 'discussion',
    status: 'published',
    tags: [],
    upvotes: 4,
    commentCount: 2,
    viewCount: 10,
    isPinned: false,
    featuredLabel: null,
    acceptedCommentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    group: {
      id: '00000000-0000-4000-8000-000000000002',
      slug: 'example-circle',
      name: 'Example Circle',
      description: 'An example circle',
      color: '#3f8f82',
      visibility: 'public',
      memberCount: 1,
    },
    author: {
      id: '00000000-0000-4000-8000-000000000003',
      username: 'exampleoperator',
      userslug: 'example-operator',
      fullName: 'Example Operator',
      pictureUrl: null,
      role: 'member',
      reputationScore: 0,
      streakDays: 0,
      acceptedSolutions: 0,
      level: 1,
    },
    ...overrides,
  } as PostDetail;
}

describe('buildPostJsonLd', () => {
  test('emits every property Google requires for a forum post', () => {
    const jsonLd = buildPostJsonLd(makePost(), CANONICAL);
    expect(jsonLd).not.toBeNull();
    expect(jsonLd?.['@context']).toBe('https://schema.org');
    expect(jsonLd?.['@type']).toBe('DiscussionForumPosting');
    expect(jsonLd?.author['@type']).toBe('Person');
    expect(jsonLd?.author.name).toBe('Example Operator');
    expect(jsonLd?.datePublished).toBe('2026-01-01T00:00:00.000Z');
    expect(jsonLd?.dateModified).toBe('2026-01-02T00:00:00.000Z');
    expect(jsonLd?.text).toBeTruthy();
    expect(jsonLd?.url).toBe(CANONICAL);
    expect(jsonLd?.commentCount).toBe(2);
    const likes = jsonLd?.interactionStatistic.find(
      (s) => s.interactionType === 'https://schema.org/LikeAction'
    );
    const comments = jsonLd?.interactionStatistic.find(
      (s) => s.interactionType === 'https://schema.org/CommentAction'
    );
    expect(likes?.userInteractionCount).toBe(4);
    expect(comments?.userInteractionCount).toBe(2);
  });

  test('graph linkage: @id, isPartOf circle page, publisher = www Organization', () => {
    const jsonLd = buildPostJsonLd(makePost(), CANONICAL);
    expect(jsonLd?.['@id']).toBe(`${CANONICAL}#post`);
    expect(jsonLd?.isPartOf['@id']).toBe('https://operator.example.com/g/example-circle');
    expect(jsonLd?.publisher['@id']).toBe('https://www.promptmetrics.dev/#organization');
  });

  test('text is plain — never the HTML body', () => {
    const jsonLd = buildPostJsonLd(makePost(), CANONICAL);
    expect(jsonLd?.text).toBe('Example body');
    expect(jsonLd?.text).not.toContain('<');
  });

  test('falls back to username when the author has no full name', () => {
    const post = makePost();
    const jsonLd = buildPostJsonLd(
      { ...post, author: { ...post.author, fullName: null } } as PostDetail,
      CANONICAL
    );
    expect(jsonLd?.author.name).toBe('exampleoperator');
  });

  test('author.url points at the crawlable /u/ profile page', () => {
    const jsonLd = buildPostJsonLd(makePost(), CANONICAL);
    expect(jsonLd?.author.url).toBe('https://operator.example.com/u/example-operator');
  });

  test('author.url is omitted when the author has no userslug', () => {
    const post = makePost();
    const jsonLd = buildPostJsonLd(
      { ...post, author: { ...post.author, userslug: '' } } as PostDetail,
      CANONICAL
    );
    expect(jsonLd?.author).not.toHaveProperty('url');
  });

  test('no image property — text alone satisfies the one-of requirement', () => {
    const jsonLd = buildPostJsonLd(
      makePost({ coverImageUrl: 'https://storage.example.com/cover.png?token=redacted' }),
      CANONICAL
    );
    expect(jsonLd).not.toHaveProperty('image');
  });

  test('returns null for a redacted post rather than claiming empty content', () => {
    expect(buildPostJsonLd(makePost({ contentPlain: '' }), CANONICAL)).toBeNull();
    expect(buildPostJsonLd(makePost({ contentPlain: '   ' }), CANONICAL)).toBeNull();
    expect(buildPostJsonLd(makePost({ title: '' }), CANONICAL)).toBeNull();
  });
});

describe('serializeJsonLd', () => {
  test('a post body containing </script> cannot close the tag', () => {
    const jsonLd = buildPostJsonLd(
      makePost({ contentPlain: 'before </script><img onerror=alert(1)> after' }),
      CANONICAL
    );
    const serialized = serializeJsonLd(jsonLd);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<img');
    expect(serialized).toContain('\\u003c');
    // Still valid JSON, and the text survives intact once parsed.
    expect(JSON.parse(serialized).text).toContain('</script>');
  });
});
