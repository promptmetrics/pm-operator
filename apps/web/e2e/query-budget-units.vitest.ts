// DB-free unit guards for the two query-budget refactors:
//
//   * getAnalyticsOverview — was one 7-wide Promise.all, now sequential waves
//     of at most 3 (pool = 3; see MEMORY "DB pool starvation trap", which cost
//     a 10-minute production outage on 2026-08-02).
//   * getUserBadges progress — was one count query per unearned badge with
//     computable criteria, now a constant number of GROUPed bucket statements.
//
// The runtime guards (admin-dashboard-concurrency.vitest.ts,
// badges-concurrency.vitest.ts) measure in-flight queries against a real
// database. This file needs none: it scans the analytics source for wave widths
// and proves the folded badge arithmetic returns exactly what the old per-badge
// count queries returned, so it can run anywhere without touching .env.local.
import { describe, expect, test, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CountingCriteria } from '../lib/services/badges';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

interface CatalogEntry {
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    sortOrder: number;
    createdAt: string;
  };
  criteria: unknown;
}

// Mutable so a single test can swap in a larger catalog and show the query
// count does not grow with it. Assigned before every call into the service.
let mockCatalog: CatalogEntry[] = [];

vi.mock('../lib/services/badges-catalog-cache', () => ({
  getCachedBadgeCatalog: async () => mockCatalog,
}));

const { getUserBadges, countFromBuckets, requiredBuckets } = await import(
  '../lib/services/badges'
);

// ── Wave-width scan over the analytics source ────────────────────────────────

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Every `Promise.all([...])` array in `source`, with its top-level width. */
function promiseAllWidths(source: string): number[] {
  const widths: number[] = [];
  const needle = 'Promise.all([';
  let from = 0;

  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) break;

    let depth = 0;
    let width = 1;
    let i = start + needle.length - 1; // sits on the '['

    for (; i < source.length; i++) {
      const char = source[i];
      if (char === '[' || char === '(' || char === '{') depth++;
      else if (char === ']' || char === ')' || char === '}') {
        depth--;
        if (depth === 0) break;
      } else if (char === ',' && depth === 1) width++;
    }

    const body = source.slice(start + needle.length, i);
    if (/,\s*$/.test(body)) width--; // trailing comma must not inflate the count
    if (body.trim() === '') width = 0;

    widths.push(width);
    from = i + 1;
  }

  return widths;
}

function analyticsSource(): string {
  return stripComments(
    readFileSync(path.join(webRoot, 'lib/services/analytics.ts'), 'utf8')
  );
}

describe('analytics source shape', () => {
  test('the width parser catches an over-wide wave (guards against a vacuous test)', () => {
    expect(promiseAllWidths('await Promise.all([a(), b(), c(), d()]);')).toEqual([4]);
    expect(promiseAllWidths('await Promise.all([\n  a(),\n  b(),\n]);')).toEqual([2]);
  });

  test('every analytics wave stays at or under the pool size of 3', () => {
    const widths = promiseAllWidths(analyticsSource());

    // getAdminDashboard's two waves of 3 plus getAnalyticsOverview's two.
    expect(widths.length).toBeGreaterThanOrEqual(4);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(3);
    }
  });

  test('getAnalyticsOverview no longer opens all seven counters at once', () => {
    const source = analyticsSource();
    const body = source.slice(
      source.indexOf('export async function getAnalyticsOverview'),
      source.indexOf('export async function getMemberGrowth')
    );

    expect(body).not.toBe('');
    expect(promiseAllWidths(body)).toEqual([3, 3]);
    // The seventh counter is awaited on its own, not bolted onto a wave.
    expect(body).toContain('const totalCommentsResult = await db');
  });
});

// ── Badge progress parity ────────────────────────────────────────────────────
//
// A synthetic dataset plus a JS transcription of the OLD per-badge SQL. The
// buckets are built from the same dataset exactly as the new GROUP BY produces
// them, so any disagreement between the two is a real behaviour change.

const USER = 'user-1';
const OTHER = 'user-2';

interface PostRow {
  id: string;
  authorId: string;
  status: string;
  type: string;
  /** null models a group_id the INNER JOIN cannot resolve — the row is dropped. */
  groupSlug: string | null;
  acceptedCommentId: string | null;
}

interface CommentRow {
  id: string;
  postId: string;
  authorId: string;
  status: string;
}

interface PointEventRow {
  userId: string;
  eventType: string;
  /** null models point_events.group_id being NULL or set-null by a deleted group. */
  groupSlug: string | null;
}

const POSTS: PostRow[] = [
  { id: 'p1', authorId: USER, status: 'published', type: 'question', groupSlug: 'ops', acceptedCommentId: 'c1' },
  { id: 'p2', authorId: USER, status: 'published', type: 'question', groupSlug: 'ops', acceptedCommentId: null },
  { id: 'p3', authorId: USER, status: 'published', type: 'discussion', groupSlug: 'growth', acceptedCommentId: null },
  { id: 'p4', authorId: USER, status: 'published', type: 'build', groupSlug: 'ops', acceptedCommentId: 'c9' },
  { id: 'p5', authorId: USER, status: 'draft', type: 'question', groupSlug: 'ops', acceptedCommentId: null },
  { id: 'p6', authorId: USER, status: 'published', type: 'lesson', groupSlug: null, acceptedCommentId: null },
  { id: 'p7', authorId: OTHER, status: 'published', type: 'question', groupSlug: 'ops', acceptedCommentId: null },
  { id: 'p8', authorId: OTHER, status: 'published', type: 'discussion', groupSlug: 'growth', acceptedCommentId: 'c4' },
];

const COMMENTS: CommentRow[] = [
  { id: 'c1', postId: 'p1', authorId: USER, status: 'published' },
  { id: 'c2', postId: 'p1', authorId: USER, status: 'published' },
  { id: 'c3', postId: 'p3', authorId: USER, status: 'published' },
  { id: 'c4', postId: 'p8', authorId: USER, status: 'published' },
  { id: 'c5', postId: 'p6', authorId: USER, status: 'published' },
  { id: 'c6', postId: 'p2', authorId: USER, status: 'hidden' },
  { id: 'c7', postId: 'p7', authorId: OTHER, status: 'published' },
  { id: 'c8', postId: 'p-missing', authorId: USER, status: 'published' },
  { id: 'c9', postId: 'p4', authorId: OTHER, status: 'published' },
];

const POINT_EVENTS: PointEventRow[] = [
  { userId: USER, eventType: 'like_received', groupSlug: 'ops' },
  { userId: USER, eventType: 'like_received', groupSlug: 'ops' },
  { userId: USER, eventType: 'like_received', groupSlug: 'growth' },
  { userId: USER, eventType: 'like_received', groupSlug: null },
  { userId: USER, eventType: 'like_given', groupSlug: null },
  { userId: USER, eventType: 'invite_accepted', groupSlug: null },
  { userId: USER, eventType: 'daily_visit', groupSlug: 'ops' },
  { userId: USER, eventType: 'streak_bonus', groupSlug: null },
  { userId: USER, eventType: 'manual_award', groupSlug: 'growth' },
  { userId: OTHER, eventType: 'like_received', groupSlug: 'ops' },
];

function criteriaOf(
  eventType: string,
  postType?: string,
  groupSlug?: string
): CountingCriteria {
  const criteria: Record<string, unknown> = { eventType, threshold: 1 };
  if (postType !== undefined) criteria.postType = postType;
  if (groupSlug !== undefined) criteria.groupSlug = groupSlug;
  return criteria as CountingCriteria;
}

/** The old countForUser(), transcribed from its SQL into JS. */
function legacyCount(criteria: CountingCriteria): number {
  const eventType = criteria.eventType as string;
  const postType = 'postType' in criteria ? criteria.postType : undefined;
  const groupSlug = 'groupSlug' in criteria ? criteria.groupSlug : undefined;

  if (eventType === 'topic_created') {
    return POSTS.filter(
      (post) =>
        post.authorId === USER &&
        post.status === 'published' &&
        post.groupSlug !== null && // INNER JOIN groups
        (postType === undefined || post.type === postType) &&
        (groupSlug === undefined || post.groupSlug === groupSlug)
    ).length;
  }

  if (eventType === 'comment_created' || eventType === 'solution_accepted') {
    return COMMENTS.filter((comment) => {
      if (comment.authorId !== USER || comment.status !== 'published') return false;
      const post = POSTS.find((row) => row.id === comment.postId);
      if (!post) return false; // INNER JOIN posts
      if (post.groupSlug === null) return false; // INNER JOIN groups
      if (postType !== undefined && post.type !== postType) return false;
      if (groupSlug !== undefined && post.groupSlug !== groupSlug) return false;
      if (eventType === 'solution_accepted') {
        return post.acceptedCommentId !== null && post.acceptedCommentId === comment.id;
      }
      return true;
    }).length;
  }

  // The old point_events branch joined groups ONLY when a groupSlug was given.
  return POINT_EVENTS.filter(
    (event) =>
      event.userId === USER &&
      event.eventType === eventType &&
      (groupSlug === undefined || event.groupSlug === groupSlug)
  ).length;
}

/** What `postCountBuckets` returns for this dataset. */
function postBuckets() {
  const buckets = new Map<string, { postType: string; groupSlug: string; value: number }>();
  for (const post of POSTS) {
    if (post.authorId !== USER || post.status !== 'published') continue;
    if (post.groupSlug === null) continue;
    const key = `${post.type} ${post.groupSlug}`;
    const bucket =
      buckets.get(key) ?? { postType: post.type, groupSlug: post.groupSlug, value: 0 };
    bucket.value += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

/** What `commentCountBuckets` returns for this dataset. */
function commentBuckets() {
  const buckets = new Map<
    string,
    { postType: string; groupSlug: string; comments: number; solutions: number }
  >();
  for (const comment of COMMENTS) {
    if (comment.authorId !== USER || comment.status !== 'published') continue;
    const post = POSTS.find((row) => row.id === comment.postId);
    if (!post || post.groupSlug === null) continue;
    const key = `${post.type} ${post.groupSlug}`;
    const bucket =
      buckets.get(key) ??
      { postType: post.type, groupSlug: post.groupSlug, comments: 0, solutions: 0 };
    bucket.comments += 1;
    if (post.acceptedCommentId !== null && post.acceptedCommentId === comment.id) {
      bucket.solutions += 1;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

/** What `pointEventCountBuckets` returns for this dataset (LEFT JOIN groups). */
function pointEventBuckets() {
  const buckets = new Map<
    string,
    { eventType: string; groupSlug: string | null; value: number }
  >();
  for (const event of POINT_EVENTS) {
    if (event.userId !== USER) continue;
    const key = `${event.eventType} ${event.groupSlug ?? ''}`;
    const bucket =
      buckets.get(key) ??
      { eventType: event.eventType, groupSlug: event.groupSlug, value: 0 };
    bucket.value += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

const EVENT_TYPES = [
  'topic_created',
  'comment_created',
  'solution_accepted',
  'like_received',
  'like_given',
  'invite_accepted',
  'daily_visit',
  'posts_read',
  'streak_bonus',
  'manual_award',
];

// undefined = predicate absent. '' is included on purpose: zod allows an empty
// groupSlug, and eq(groups.slug, '') matched nothing, so the folded filter must
// test `!== undefined` rather than truthiness.
const POST_TYPES = [undefined, 'discussion', 'question', 'build', 'lesson'];
const GROUP_SLUGS = [undefined, 'ops', 'growth', 'no-such-circle', ''];

describe('badge progress parity', () => {
  const posts = postBuckets();
  const comments = commentBuckets();
  const events = pointEventBuckets();

  test('the fixture actually exercises the branches (no vacuous all-zero parity)', () => {
    expect(legacyCount(criteriaOf('topic_created'))).toBe(4);
    expect(legacyCount(criteriaOf('topic_created', 'question'))).toBe(2);
    // c1, c2, c3, c4 — c5's post has no resolvable group, c6 is hidden, c8's
    // post is missing, c7/c9 belong to another author.
    expect(legacyCount(criteriaOf('comment_created'))).toBe(4);
    // c1 accepted on p1, c4 accepted on p8 — the author of the POST is
    // irrelevant, only the author of the accepted comment.
    expect(legacyCount(criteriaOf('solution_accepted'))).toBe(2);
    expect(legacyCount(criteriaOf('like_received'))).toBe(4);
    expect(legacyCount(criteriaOf('like_received', undefined, 'ops'))).toBe(2);
  });

  test('every eventType x postType x groupSlug combination matches the old count', () => {
    let checked = 0;
    let nonZero = 0;

    for (const eventType of EVENT_TYPES) {
      for (const postType of POST_TYPES) {
        for (const groupSlug of GROUP_SLUGS) {
          const criteria = criteriaOf(eventType, postType, groupSlug);
          const expected = legacyCount(criteria);
          const actual = countFromBuckets(criteria, posts, comments, events);

          // Compared as objects so a failure names the exact combination.
          expect({ eventType, postType, groupSlug, count: actual }).toEqual({
            eventType,
            postType,
            groupSlug,
            count: expected,
          });

          checked += 1;
          if (expected > 0) nonZero += 1;
        }
      }
    }

    expect(checked).toBe(EVENT_TYPES.length * POST_TYPES.length * GROUP_SLUGS.length);
    expect(nonZero).toBeGreaterThan(10);
  });

  test('an empty-string groupSlug narrows to nothing, as eq(slug, "") did', () => {
    const criteria = criteriaOf('topic_created', undefined, '');
    expect(legacyCount(criteria)).toBe(0);
    expect(countFromBuckets(criteria, posts, comments, events)).toBe(0);
  });

  test('point_events with no group still count when the badge has no groupSlug', () => {
    // 4 like_received rows, one with a NULL group — the old no-groupSlug query
    // did not join groups at all, so it counted that row too.
    expect(countFromBuckets(criteriaOf('like_received'), posts, comments, events)).toBe(4);
    expect(
      countFromBuckets(criteriaOf('like_received', undefined, 'ops'), posts, comments, events)
    ).toBe(2);
  });

  test('postType is ignored on the point_events branch, as it always was', () => {
    expect(
      countFromBuckets(criteriaOf('like_received', 'question'), posts, comments, events)
    ).toBe(countFromBuckets(criteriaOf('like_received'), posts, comments, events));
  });
});

describe('requiredBuckets', () => {
  test('asks only for the source tables the criteria need', () => {
    expect(requiredBuckets([])).toEqual({
      posts: false,
      comments: false,
      pointEvents: false,
    });
    expect(requiredBuckets([criteriaOf('topic_created')])).toEqual({
      posts: true,
      comments: false,
      pointEvents: false,
    });
    expect(requiredBuckets([criteriaOf('comment_created')])).toEqual({
      posts: false,
      comments: true,
      pointEvents: false,
    });
    expect(requiredBuckets([criteriaOf('solution_accepted')])).toEqual({
      posts: false,
      comments: true,
      pointEvents: false,
    });
    expect(requiredBuckets([criteriaOf('daily_visit')])).toEqual({
      posts: false,
      comments: false,
      pointEvents: true,
    });
    expect(
      requiredBuckets([
        criteriaOf('topic_created'),
        criteriaOf('comment_created'),
        criteriaOf('posts_read'),
      ])
    ).toEqual({ posts: true, comments: true, pointEvents: true });
  });
});

// ── getUserBadges progress mapping ───────────────────────────────────────────

function badge(id: string, slug: string, sortOrder: number) {
  return {
    id,
    slug,
    name: slug,
    description: null,
    iconUrl: null,
    sortOrder,
    createdAt: '2026-01-15T00:00:00.000Z',
  };
}

type Db = Parameters<typeof getUserBadges>[0];

/**
 * Drizzle stand-in that answers each bucket statement by the shape of its
 * selection object, records call order, and tracks the concurrency high-water
 * mark. Resolution is deferred a tick so genuinely concurrent queries overlap.
 */
function fakeDb(rows: {
  /** null models the user row being missing entirely (findFirst -> undefined). */
  streakDays: number | null;
  userBadges: { badgeId: string; awardedAt: Date }[];
}) {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  function run<T>(label: string, value: T): Promise<T> {
    calls.push(label);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((resolve) =>
      setTimeout(() => {
        inFlight -= 1;
        resolve(value);
      }, 5)
    );
  }

  function chain(label: string, value: unknown): unknown {
    let execution: Promise<unknown> | null = null;
    return new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          if (!execution) execution = run(label, value);
          return execution.then.bind(execution);
        }
        return () => chain(label, value);
      },
      apply() {
        return chain(label, value);
      },
    });
  }

  const db = {
    select: (selection: Record<string, unknown>) => {
      const shape = Object.keys(selection).sort().join(',');
      if (shape === 'comments,groupSlug,postType,solutions') {
        return chain('comments', commentBuckets());
      }
      if (shape === 'eventType,groupSlug,value') {
        return chain('pointEvents', pointEventBuckets());
      }
      if (shape === 'groupSlug,postType,value') {
        return chain('posts', postBuckets());
      }
      throw new Error(`unexpected bucket selection: ${shape}`);
    },
    query: {
      users: {
        findFirst: () =>
          run(
            'users',
            rows.streakDays === null ? undefined : { streakDays: rows.streakDays }
          ),
      },
      userBadges: { findMany: () => run('userBadges', rows.userBadges) },
    },
  } as unknown as Db;

  return { db, stats: () => ({ calls, maxInFlight }) };
}

describe('getUserBadges progress mapping', () => {
  test('progress matches the per-badge counts, clamped, in catalog order', async () => {
    mockCatalog = [
      { badge: badge('b1', 'first-post', 10), criteria: { eventType: 'topic_created', threshold: 1 } },
      { badge: badge('b2', 'ten-posts', 20), criteria: { eventType: 'topic_created', threshold: 10 } },
      { badge: badge('b3', 'ops-questions', 30), criteria: { eventType: 'topic_created', postType: 'question', groupSlug: 'ops', threshold: 5 } },
      { badge: badge('b4', 'commenter', 40), criteria: { eventType: 'comment_created', threshold: 2 } },
      { badge: badge('b5', 'solver', 50), criteria: { eventType: 'solution_accepted', threshold: 3 } },
      { badge: badge('b6', 'liked', 60), criteria: { eventType: 'like_received', threshold: 3 } },
      { badge: badge('b7', 'week-streak', 70), criteria: { type: 'streak', days: 7 } },
      { badge: badge('b8', 'manual', 80), criteria: { note: 'awarded by hand' } },
      { badge: badge('b9', 'already-earned', 90), criteria: { eventType: 'topic_created', threshold: 1 } },
    ];

    const { db } = fakeDb({
      streakDays: 3,
      userBadges: [{ badgeId: 'b9', awardedAt: new Date('2026-02-01T00:00:00.000Z') }],
    });

    const result = await getUserBadges(db, USER);

    expect(result.earned).toEqual([
      { badge: mockCatalog[8].badge, awardedAt: '2026-02-01T00:00:00.000Z' },
    ]);

    // Every `current` is Math.min(legacyCount, threshold); the streak badge
    // reads streakDays (3) instead of querying. Free-form criteria (b8) are
    // skipped entirely, and the earned badge (b9) never reaches progress.
    expect(
      result.progress.map((item) => [item.badge.slug, item.current, item.threshold])
    ).toEqual([
      ['first-post', Math.min(legacyCount(criteriaOf('topic_created')), 1), 1],
      ['ten-posts', Math.min(legacyCount(criteriaOf('topic_created')), 10), 10],
      ['ops-questions', Math.min(legacyCount(criteriaOf('topic_created', 'question', 'ops')), 5), 5],
      ['commenter', Math.min(legacyCount(criteriaOf('comment_created')), 2), 2],
      ['solver', Math.min(legacyCount(criteriaOf('solution_accepted')), 3), 3],
      ['liked', Math.min(legacyCount(criteriaOf('like_received')), 3), 3],
      ['week-streak', 3, 7],
    ]);

    // Spelled out, so a silent change to the clamp or the fixture is visible.
    expect(result.progress.map((item) => item.current)).toEqual([1, 4, 2, 2, 2, 3, 3]);
  });

  test('query count is constant in the catalog size and peaks at 2 concurrent', async () => {
    const counting = [
      { badge: badge('b1', 'a', 10), criteria: { eventType: 'topic_created', threshold: 1 } },
      { badge: badge('b2', 'b', 20), criteria: { eventType: 'comment_created', threshold: 1 } },
      { badge: badge('b3', 'c', 30), criteria: { eventType: 'like_received', threshold: 1 } },
    ];
    mockCatalog = counting;

    const small = fakeDb({ streakDays: 0, userBadges: [] });
    await getUserBadges(small.db, USER);
    const smallStats = small.stats();

    // 40 more badges spread over the same three source tables.
    mockCatalog = [
      ...counting,
      ...Array.from({ length: 40 }, (_, index) => ({
        badge: badge(`x${index}`, `x${index}`, 100 + index),
        criteria: {
          eventType: EVENT_TYPES[index % EVENT_TYPES.length],
          threshold: index + 1,
        },
      })),
    ];

    const large = fakeDb({ streakDays: 0, userBadges: [] });
    const largeResult = await getUserBadges(large.db, USER);
    const largeStats = large.stats();

    expect(largeResult.progress).toHaveLength(43);
    expect(smallStats.calls).toEqual(largeStats.calls);
    expect(largeStats.calls).toEqual([
      'users',
      'userBadges',
      'posts',
      'comments',
      'pointEvents',
    ]);
    // 5 total, never more than 2 at once — the community layout's rail query
    // takes the third pool slot.
    expect(largeStats.calls).toHaveLength(5);
    expect(largeStats.maxInFlight).toBe(2);
  });

  test('a streak-only catalog costs no bucket query at all', async () => {
    mockCatalog = [
      { badge: badge('s1', 'week-streak', 10), criteria: { type: 'streak', days: 7 } },
      { badge: badge('s2', 'month-streak', 20), criteria: { type: 'streak', days: 30 } },
    ];

    const { db, stats } = fakeDb({ streakDays: 12, userBadges: [] });
    const result = await getUserBadges(db, USER);

    expect(stats().calls).toEqual(['users', 'userBadges']);
    expect(result.progress.map((item) => item.current)).toEqual([7, 12]);
  });

  test('a missing user row still yields 0 streak progress, not a crash', async () => {
    mockCatalog = [
      { badge: badge('s1', 'week-streak', 10), criteria: { type: 'streak', days: 7 } },
    ];

    const { db } = fakeDb({ streakDays: null, userBadges: [] });
    const result = await getUserBadges(db, 'ghost');

    expect(result.progress).toEqual([
      { badge: mockCatalog[0].badge, current: 0, threshold: 7 },
    ]);
  });
});

// ── Landing page data cache ──────────────────────────────────────────────────
//
// getLandingData recomputes at most once a day (unstable_cache, revalidate
// 86400) and the recompute fits the pool=3 budget: one combined counts
// statement, one curated-slug lookup, and at most one backfill — strictly
// sequential. Scanned here so nobody widens it into a Promise.all later
// (MEMORY "DB pool starvation trap").

function landingSource(): string {
  return stripComments(
    readFileSync(path.join(webRoot, 'lib/services/landing.ts'), 'utf8')
  );
}

describe('landing service source shape', () => {
  test('no Promise.all anywhere: a recompute never widens past one query', () => {
    expect(landingSource()).not.toContain('Promise.all');
  });

  test('a recompute awaits at most three queries', () => {
    const awaited = landingSource().match(/await\s+db\b/g) ?? [];
    expect(awaited.length).toBeGreaterThan(0);
    expect(awaited.length).toBeLessThanOrEqual(3);
  });

  test('the cache entry revalidates daily, so a warm request runs zero queries', () => {
    expect(landingSource()).toContain('revalidate: 86400');
  });
});
