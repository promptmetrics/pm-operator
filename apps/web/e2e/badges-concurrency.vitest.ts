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
const CATALOG = [
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

vi.mock('../lib/services/badges-catalog-cache', () => ({
  getCachedBadgeCatalog: vi.fn(async () => CATALOG),
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
    const waves = promiseAllWaves(read('lib/services/badges.ts'));

    expect(waves.length).toBeGreaterThanOrEqual(1);
    for (const wave of waves) {
      expect(wave.width).toBeLessThanOrEqual(2);
    }
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

  const db = {
    select: () => chain([{ value: 4 }]),
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

    // streakDays + userBadges (the 2-wide wave) + one sequential countForUser
    // for the single unearned, non-streak badge. The catalog is not among them.
    expect(stats().started).toBe(3);
  });

  test('the per-badge progress counts stay sequential, never a fan-out', async () => {
    const { db, stats } = trackingDb();

    const result = await getUserBadges(db, 'user-1');

    // Earned badge is skipped; streak progress reads the already-fetched
    // streakDays; only the counting badge queries — and it is awaited inside
    // the loop, so it can never overlap another count.
    expect(result.earned.map((e) => e.badge.slug)).toEqual(['first-answer']);
    expect(result.progress.map((p) => p.badge.slug)).toEqual([
      'seven-day-streak',
      'ten-posts',
    ]);
    expect(stats().maxInFlight).toBe(2);
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
