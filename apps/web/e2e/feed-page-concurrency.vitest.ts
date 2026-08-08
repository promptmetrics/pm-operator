import { test, expect } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getOnboardingChecklistStatus,
  shouldSkipOnboardingChecklist,
} from '../lib/services/onboarding';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

// Concurrency-budget guard for the feed page after track 3C (onboarding
// checklist §4.7 + "Help someone today" rail widget §4.8).
//
// The DB pool is 3 connections per instance; a wide Promise.all over fan-out
// services starved it and caused the 2026-08-02 production outage. The
// community layout runs ONE rail query concurrently with the page on every
// navigation, so no page wave may be wider than 2 queries.
//
// Like palette-concurrency.vitest.ts these are structural tests — a source
// scan for the wave shape plus a mock drizzle client — so they run without a
// database (DB-backed tests are CI-only).

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

test('wave parser detects an over-wide wave (guards against a vacuous budget test)', () => {
  const overWide = `await Promise.all([a(db, 1), b(db, { x: 1 }), c(db)]);`;
  expect(promiseAllWaves(overWide).map((w) => w.width)).toEqual([3]);

  const nested = `await Promise.all([a([1, 2, 3]), b()]);`;
  expect(promiseAllWaves(nested).map((w) => w.width)).toEqual([2]);

  const trailing = `await Promise.all([\n  a(),\n  b(),\n]);`;
  expect(promiseAllWaves(trailing).map((w) => w.width)).toEqual([2]);
});

test('feed page keeps every query wave at most 2 wide (pool budget 3, layout rail takes 1)', () => {
  const source = stripComments(
    readFileSync(path.join(webRoot, 'app/(community)/feed/page.tsx'), 'utf8')
  );

  const waves = promiseAllWaves(source);

  // Pre-existing waves (feed+leaderboard, groups+featured, pinned+viewer) plus
  // track 3C's new wave (help queue + checklist).
  expect(waves.length).toBeGreaterThanOrEqual(4);
  for (const wave of waves) {
    expect(wave.width).toBeLessThanOrEqual(2);
  }

  // Track 3C's two additions are each issued exactly once...
  expect(source.match(/getHelpQueue\(/g)?.length).toBe(1);
  expect(source.match(/getOnboardingChecklistStatus\(/g)?.length).toBe(1);

  // ...and share ONE wave that is still only 2 wide.
  const trackWave = waves.find((wave) => wave.body.includes('getHelpQueue('));
  expect(trackWave).toBeDefined();
  expect(trackWave!.body).toContain('getOnboardingChecklistStatus(');
  expect(trackWave!.width).toBe(2);
});

test('community layout still runs exactly one rail query (no fan-out beside the page)', () => {
  const source = stripComments(
    readFileSync(path.join(webRoot, 'app/(community)/layout.tsx'), 'utf8')
  );

  // The rail is a single awaited query per request; a Promise.all here would
  // push the combined page+layout path past the pool of 3.
  expect(source).not.toContain('Promise.all');
});

type Db = Parameters<typeof getOnboardingChecklistStatus>[0];

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
    update: () => chain(),
    with: () => chain(),
    $with: () => chain(),
    query: { users: { findFirst: () => chain() } },
  } as unknown as Db;

  return { db, stats: () => ({ maxInFlight, started }) };
}

test('checklist costs ONE query and never overlaps it with anything else', async () => {
  const { db, stats } = trackingDb([
    [{ circleCount: 2, hasPost: false, hasComment: false }],
  ]);

  const status = await getOnboardingChecklistStatus(db, 'viewer-1', {});

  const { maxInFlight, started } = stats();
  expect(started).toBe(1); // one statement, three scalar subqueries
  expect(maxInFlight).toBe(1);
  expect(maxInFlight).toBeLessThanOrEqual(3);

  expect(status).toEqual({
    circleCount: 2,
    hasPost: false,
    hasComment: false,
    completedCount: 1,
  });
});

test('checklist query is SKIPPED entirely when preferences say dismissed or complete', async () => {
  for (const preferences of [
    { checklistDismissed: true },
    { checklistCompletedAt: '2026-08-08T12:00:00.000Z' },
    { checklistDismissed: true, checklistCompletedAt: '2026-08-08T12:00:00.000Z' },
  ]) {
    expect(shouldSkipOnboardingChecklist(preferences)).toBe(true);

    const { db, stats } = trackingDb();
    const status = await getOnboardingChecklistStatus(db, 'viewer-1', preferences);

    expect(status).toBeNull();
    expect(stats().started).toBe(0); // steady state costs zero queries
  }

  // A fresh user (no keys yet) still runs it.
  expect(shouldSkipOnboardingChecklist({})).toBe(false);
  expect(shouldSkipOnboardingChecklist(null)).toBe(false);
});

test('completion is cached write-once, sequentially after the read (never concurrent)', async () => {
  const { db, stats } = trackingDb([
    [{ circleCount: 5, hasPost: true, hasComment: true }],
    [],
  ]);

  const status = await getOnboardingChecklistStatus(db, 'viewer-1', {});

  const { maxInFlight, started } = stats();
  expect(status?.completedCount).toBe(3);
  expect(started).toBe(2); // read, then the preferences stamp
  expect(maxInFlight).toBe(1); // strictly sequential — the write awaits the read

  // The very next request short-circuits on the persisted flag.
  expect(
    shouldSkipOnboardingChecklist({ checklistCompletedAt: '2026-08-08T12:00:00.000Z' })
  ).toBe(true);
});
