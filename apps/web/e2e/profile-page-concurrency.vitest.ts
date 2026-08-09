import { test, expect } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listUserCirclePoints } from '../lib/services/users';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

// Concurrency-budget guard for the profile page after track 5C (per-circle
// points breakdown).
//
// The DB pool is 3 connections per instance; a wide Promise.all over fan-out
// services starved it and caused the 2026-08-02 production outage. The
// community layout runs ONE rail query concurrently with the page on every
// navigation, so no page wave may be wider than 2 queries.
//
// Structural, like feed-page-concurrency.vitest.ts: a source scan for the wave
// shape plus a mock drizzle client, so it runs without a database.

/** Strips line/block comments so commented-out code can't skew the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

interface Wave {
  /** Number of top-level elements in the Promise.all array. */
  width: number;
  /** The array body, for identifying which services share the wave. */
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

function profileSource(): string {
  return stripComments(
    readFileSync(path.join(webRoot, 'app/(community)/u/[slug]/page.tsx'), 'utf8')
  );
}

test('wave parser detects an over-wide wave (guards against a vacuous budget test)', () => {
  const overWide = `await Promise.all([a(db, 1), b(db, { x: 1 }), c(db)]);`;
  expect(promiseAllWaves(overWide).map((w) => w.width)).toEqual([3]);

  const trailing = `await Promise.all([\n  a(),\n  b(),\n]);`;
  expect(promiseAllWaves(trailing).map((w) => w.width)).toEqual([2]);
});

test('profile page keeps every query wave at most 2 wide (pool budget 3, layout rail takes 1)', () => {
  const waves = promiseAllWaves(profileSource());

  // Authored posts+solutions, comments+streak, and track 5C's circle points +
  // viewer probe.
  expect(waves.length).toBeGreaterThanOrEqual(3);
  for (const wave of waves) {
    expect(wave.width).toBeLessThanOrEqual(2);
  }
});

test('track 5C adds exactly one query, inside an existing wave', () => {
  const source = profileSource();

  expect(source.match(/listUserCirclePoints\(/g)?.length).toBe(1);

  const wave = promiseAllWaves(source).find((w) => w.body.includes('listUserCirclePoints('));
  expect(wave).toBeDefined();
  expect(wave!.width).toBe(2);
});

test('the fan-out services still run alone, never inside a wave', () => {
  const waves = promiseAllWaves(profileSource());

  // listUserCircleContributions issues 2 concurrent queries and getUserBadges
  // 3, so pairing either with anything would breach the pool.
  for (const fanOut of ['listUserCircleContributions(', 'getUserBadges(']) {
    expect(waves.some((wave) => wave.body.includes(fanOut))).toBe(false);
  }
});

test('community layout still runs exactly one rail query (no fan-out beside the page)', () => {
  const source = stripComments(
    readFileSync(path.join(webRoot, 'app/(community)/layout.tsx'), 'utf8')
  );

  expect(source).not.toContain('Promise.all');
});

type Db = Parameters<typeof listUserCirclePoints>[0];

function trackingDb(results: unknown[][] = []) {
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;
  const queue = [...results];

  // Chainable query-builder stand-in: every method returns a fresh chain;
  // awaiting a chain "executes" the query (tracked) and resolves the next
  // queued result.
  function chain(): unknown {
    let execution: Promise<unknown> | null = null;
    return new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          if (!execution) {
            started += 1;
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const value = queue.shift() ?? [];
            execution = new Promise((resolve) =>
              setTimeout(() => {
                inFlight -= 1;
                resolve(value);
              }, 10)
            );
          }
          return execution.then.bind(execution);
        }
        return () => chain();
      },
      apply() {
        return chain();
      },
    });
  }

  const db = {
    select: () => chain(),
    query: { users: { findFirst: () => chain() } },
  } as unknown as Db;

  return { db, stats: () => ({ maxInFlight, started }) };
}

test('per-circle points costs ONE query and derives shares from the same rows', async () => {
  // numeric sums arrive as strings from pg; the window total repeats per row.
  const { db, stats } = trackingDb([
    [
      { slug: 'acme-revops', name: 'Acme RevOps', color: '#3f8f82', points: '20', total: '30' },
      { slug: 'acme-cs', name: 'Acme CS', color: null, points: '10', total: '30' },
    ],
  ]);

  const slices = await listUserCirclePoints(db, 'user-1');

  const { maxInFlight, started } = stats();
  expect(started).toBe(1); // one grouped statement, no follow-up total query
  expect(maxInFlight).toBe(1);

  expect(slices).toEqual([
    {
      group: { slug: 'acme-revops', name: 'Acme RevOps', color: '#3f8f82' },
      points: 20,
      share: 67,
    },
    { group: { slug: 'acme-cs', name: 'Acme CS', color: null }, points: 10, share: 33 },
  ]);
});

test('per-circle points is empty-safe and never divides by zero', async () => {
  const { db, stats } = trackingDb([[]]);

  const slices = await listUserCirclePoints(db, 'user-1');

  expect(slices).toEqual([]);
  expect(stats().started).toBe(1);
});
