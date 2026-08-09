// Concurrency-budget guard for getUserBadges after the badge-catalog cache.
//
// The DB pool is 3 connections per instance; a wide Promise.all over fan-out
// services starved it and caused the 2026-08-02 production outage. The
// community layout runs ONE rail query concurrently with the page on every
// navigation, so no page-side wave may be wider than 2 — and getUserBadges is
// awaited alone by the profile page, the DevCard page, GET /api/v1/users/[slug]
// and GET /api/v1/users/[slug]/badges, so its own internal peak IS the budget.
// It used to open 3 (streakDays + catalog + userBadges), i.e. 4 with the rail.
//
// Progress counts used to be an N+1: one sequential count query per unearned
// badge with computable criteria. They are now folded into one GROUPed bucket
// statement per source table (posts / comments / point_events), run as two more
// waves of at most 2 and 1. Total is at most 5 queries for ANY catalog size.
// The arithmetic those buckets feed is proved equal to the old per-badge counts
// in query-budget-units.vitest.ts, which needs no database.
//
// Structural source scan (same idea as profile-page-concurrency.vitest.ts,
// reimplemented here so the two guards stay independent) plus a mock drizzle
// client, so it runs without a database.
import { describe, expect, test, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

// The cached catalog costs 0 queries warm / 1 cold and is fetched with its own
// service db, so it never touches the client passed to getUserBadges. Mocking
// it keeps this test DB-free and isolates the wave being measured.
const BASE_CATALOG = [
  {
    badge: {
      id: 'badge-earned',
      slug: 'first-answer',
      name: 'First Answer',
      description: null,
      iconUrl: null,
      sortOrder: 10,
      createdAt: '2026-01-15T00:00:00.000Z',
    },
    criteria: { eventType: 'comment_created', threshold: 1 },
  },
  {
    badge: {
      id: 'badge-streak',
      slug: 'seven-day-streak',
      name: 'Seven Day Streak',
      description: null,
      iconUrl: null,
      sortOrder: 20,
      createdAt: '2026-01-15T00:00:00.000Z',
    },
    criteria: { type: 'streak', days: 7 },
  },
  {
    badge: {
      id: 'badge-counted',
      slug: 'ten-posts',
      name: 'Ten Posts',
      description: null,
      iconUrl: null,
      sortOrder: 30,
      createdAt: '2026-01-15T00:00:00.000Z',
    },
    criteria: { eventType: 'topic_created', threshold: 10 },
  },
];

// Mutable so one test can grow the catalog and show the query count does not
// grow with it. Every other test sees BASE_CATALOG.
let catalogFixture: typeof BASE_CATALOG = BASE_CATALOG;

vi.mock('../lib/services/badges-catalog-cache', () => ({
  getCachedBadgeCatalog: vi.fn(async () => catalogFixture),
}));

const { getUserBadges } = await import('../lib/services/badges');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

interface Wave {
  width: number;
  body: string;
}

/** Every `Promise.all([...])` array in `source`, with its top-level width. */
function promiseAllWaves(source: string): Wave[] {
  const waves: Wave[] = [];
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

    waves.push({ width, body });
    from = i + 1;
  }

  return waves;
}

function read(relative: string): string {
  return stripComments(readFileSync(path.join(webRoot, relative), 'utf8'));
}

describe('source shape', () => {
  test('wave parser detects an over-wide wave (guards against a vacuous budget test)', () => {
    const overWide = `await Promise.all([a(db, 1), b(db, { x: 1 }), c(db)]);`;
    expect(promiseAllWaves(overWide).map((w) => w.width)).toEqual([3]);

    const trailing = `await Promise.all([\n  a(),\n  b(),\n]);`;
    expect(promiseAllWaves(trailing).map((w) => w.width)).toEqual([2]);
  });

  test('the badges service keeps every query wave at most 2 wide', () => {
    const source = read('lib/services/badges.ts');
    const waves = promiseAllWaves(source);

    expect(waves.length).toBeGreaterThanOrEqual(1);
    for (const wave of waves) {
      expect(wave.width).toBeLessThanOrEqual(2);
    }

    // Exactly two waves of 2: [streakDays, userBadges] then [posts, comments]
    // buckets. The point_events bucket is the third wave and is awaited alone.
    expect(waves.map((wave) => wave.width)).toEqual([2, 2]);
    expect(source).toContain('await pointEventCountBuckets(db, userId)');
  });

  test('progress no longer issues a query per badge', () => {
    const source = read('lib/services/badges.ts');

    // The N+1 is gone: no per-badge count helper, and nothing is awaited inside
    // the loop that builds `progress`.
    expect(source).not.toContain('countForUser');

    const loop = source.slice(source.indexOf('for (const { badge, criteria } of pending)'));
    expect(loop).not.toBe('');
    expect(loop.slice(0, loop.indexOf('return { earned, progress }'))).not.toContain('await');
  });

  test('the catalog is fetched from the cache, never re-queried inside a wave', () => {
    const source = read('lib/services/badges.ts');

    // The raw catalog query moved to the cache module: nothing here may read
    // db.query.badges directly again.
    expect(source).not.toContain('db.query.badges');
    expect(source).toContain('await getCachedBadgeCatalog()');

    // ...and it must be awaited ALONE, so a cold cache adds a sequential step
    // instead of widening the fresh wave back to 3.
    const waves = promiseAllWaves(source);
    expect(waves.some((wave) => wave.body.includes('getCachedBadgeCatalog'))).toBe(false);
  });

  test('the cached wrapper is one shared, argument-free constant', () => {
    const source = read('lib/services/badges-catalog-cache.ts');

    // One cached wrapper, one key — so the key cannot drift between call sites.
    expect(source.match(/unstable_cache\(/g)?.length).toBe(1);
    expect(source).toContain("['badges-catalog']");
    expect(source).toContain('revalidate: 300');

    // No viewer-specific state may enter the cached function, or one viewer's
    // entry gets served to everyone.
    expect(source).toMatch(/unstable_cache\(\s*async \(\)/);
    expect(source).not.toContain('userId');
  });

  test('community layout still runs exactly one rail query (no fan-out beside the page)', () => {
    expect(read('app/(community)/layout.tsx')).not.toContain('Promise.all');
  });
});

type Db = Parameters<typeof getUserBadges>[0];

/**
 * Chainable drizzle stand-in that counts how many queries are open at once.
 * Awaiting a builder "executes" it; resolution is deferred a tick so genuinely
 * concurrent queries overlap and are observed.
 */
function trackingDb() {
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;

  function run<T>(value: T): Promise<T> {
    started += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((resolve) =>
      setTimeout(() => {
        inFlight -= 1;
        resolve(value);
      }, 10)
    );
  }

  function chain(value: unknown): unknown {
    let execution: Promise<unknown> | null = null;
    return new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          if (!execution) execution = run(value);
          return execution.then.bind(execution);
        }
        return () => chain(value);
      },
      apply() {
        return chain(value);
      },
    });
  }

  // Each bucket statement is identified by the shape of its selection object,
  // so the fake can hand back rows in the right shape and — more importantly —
  // fail loudly if a fourth kind of query ever appears in this path.
  const db = {
    select: (selection: Record<string, unknown>) => {
      const shape = Object.keys(selection).sort().join(',');
      if (shape === 'comments,groupSlug,postType,solutions') {
        return chain([
          { postType: 'question', groupSlug: 'ops', comments: 6, solutions: 2 },
        ]);
      }
      if (shape === 'eventType,groupSlug,value') {
        return chain([{ eventType: 'like_received', groupSlug: null, value: 9 }]);
      }
      if (shape === 'groupSlug,postType,value') {
        return chain([{ postType: 'discussion', groupSlug: 'ops', value: 4 }]);
      }
      throw new Error(`unexpected bucket selection: ${shape}`);
    },
    query: {
      users: { findFirst: () => run({ streakDays: 3 }) },
      userBadges: {
        findMany: () =>
          run([{ badgeId: 'badge-earned', awardedAt: new Date('2026-02-01T00:00:00.000Z') }]),
      },
    },
  } as unknown as Db;

  return { db, stats: () => ({ maxInFlight, started }) };
}

describe('runtime budget', () => {
  test('getUserBadges peaks at 2 concurrent queries (leaves 1 for the layout rail)', async () => {
    const { db, stats } = trackingDb();

    await getUserBadges(db, 'user-1');

    // 3 would breach the pool the moment the rail query lands beside it.
    expect(stats().maxInFlight).toBe(2);
  });

  test('the catalog costs this request path no query at all', async () => {
    const { db, stats } = trackingDb();

    await getUserBadges(db, 'user-1');

    // streakDays + userBadges (the 2-wide wave) + the posts bucket, which is
    // the only source table this catalog needs: the comment_created badge is
    // already earned and the streak badge never queries. The catalog itself is
    // not among them.
    expect(stats().started).toBe(3);
  });

  test('only the source tables an unearned badge needs are queried', async () => {
    const { db, stats } = trackingDb();

    const result = await getUserBadges(db, 'user-1');

    // Earned badge is skipped; streak progress reads the already-fetched
    // streakDays; the counting badge is served from the posts bucket.
    expect(result.earned.map((e) => e.badge.slug)).toEqual(['first-answer']);
    expect(result.progress.map((p) => p.badge.slug)).toEqual([
      'seven-day-streak',
      'ten-posts',
    ]);
    // 4 posts in the single bucket, clamped to the threshold of 10; streak
    // progress is the streakDays the wave already fetched, clamped to 7.
    expect(result.progress.map((p) => p.current)).toEqual([3, 4]);
    expect(stats().maxInFlight).toBe(2);
  });

  test('the query count is constant in the catalog size', async () => {
    const small = trackingDb();
    await getUserBadges(small.db, 'user-1');
    const smallStarted = small.stats().started;

    // 60 more unearned badges spread across all three source tables. Under the
    // old N+1 this would have been 60 extra sequential round trips.
    catalogFixture = [
      ...BASE_CATALOG,
      ...Array.from({ length: 60 }, (_, index) => ({
        badge: {
          id: `badge-${index}`,
          slug: `badge-${index}`,
          name: `Badge ${index}`,
          description: null,
          iconUrl: null,
          sortOrder: 100 + index,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
        criteria: {
          eventType: ['topic_created', 'comment_created', 'solution_accepted', 'like_received'][
            index % 4
          ],
          threshold: index + 1,
        },
      })),
    ];

    try {
      const large = trackingDb();
      const result = await getUserBadges(large.db, 'user-1');

      expect(result.progress).toHaveLength(62);
      // streakDays + userBadges + one bucket statement per source table.
      expect(large.stats().started).toBe(5);
      expect(large.stats().started).toBeGreaterThanOrEqual(smallStarted);
      // Still 2, never 3: the layout rail query needs the third pool slot.
      expect(large.stats().maxInFlight).toBe(2);
    } finally {
      catalogFixture = BASE_CATALOG;
    }
  });

  test('cached createdAt survives as the ISO string the contract expects', async () => {
    const { db } = trackingDb();

    const result = await getUserBadges(db, 'user-1');

    // A cache round-trip must not hand back a Date; the catalog serializes
    // createdAt itself so a hit and a miss return the same shape.
    expect(result.earned[0].badge.createdAt).toBe('2026-01-15T00:00:00.000Z');
    expect(result.earned[0].awardedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
