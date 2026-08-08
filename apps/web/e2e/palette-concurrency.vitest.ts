import { test, expect } from 'vitest';

import { getPaletteResults } from '../lib/services/search';

// Concurrency-budget guard for the ⌘K palette service (redesign plan §4.2).
//
// The DB pool is 3 connections per instance; a wide Promise.all over fan-out
// services starved the pool and caused the 2026-08-02 production outage.
// getPaletteResults must therefore run its three lookups as sequential
// awaits — at most ONE query in flight per request.
//
// Unlike concurrency.vitest.ts this is a structural test with a mock drizzle
// client, so it runs without a database (DB-backed tests are CI-only). Every
// query is a lazily-created thenable that resolves [] after a short delay;
// if the service ever fans out (Promise.all / unawaited kick-offs), two
// thenables overlap and maxInFlight exceeds 1.

type Db = Parameters<typeof getPaletteResults>[0];

function trackingDb() {
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;

  // Chainable query-builder stand-in: every method returns a fresh chain;
  // awaiting a chain "executes" the query (tracked) and resolves [].
  function chain(): unknown {
    let execution: Promise<unknown[]> | null = null;
    return new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          if (!execution) {
            started += 1;
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            execution = new Promise((resolve) =>
              setTimeout(() => {
                inFlight -= 1;
                resolve([]);
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
    with: () => chain(),
    $with: () => chain(),
    query: { users: { findMany: () => chain() } },
  } as unknown as Db;

  return { db, stats: () => ({ maxInFlight, started }) };
}

test('getPaletteResults runs its three queries sequentially (never >1 in flight, pool budget 3)', async () => {
  const { db, stats } = trackingDb();

  const result = await getPaletteResults(db, 'release checklist', 'viewer-1');

  const { maxInFlight, started } = stats();
  expect(started).toBe(3); // circles, posts (FTS), people
  expect(maxInFlight).toBe(1); // sequential awaits — no fan-out
  expect(maxInFlight).toBeLessThanOrEqual(3); // hard pool budget

  expect(result).toEqual({ circles: [], posts: [], people: [] });
});

test('getPaletteResults skips the FTS query when q has no indexable terms', async () => {
  const { db, stats } = trackingDb();

  // Punctuation-only input sanitizes to zero tsquery terms; running the FTS
  // query would throw on to_tsquery('simple', ''). Circles + people still run.
  const result = await getPaletteResults(db, '!!', 'viewer-1');

  const { maxInFlight, started } = stats();
  expect(started).toBe(2);
  expect(maxInFlight).toBe(1);
  expect(result).toEqual({ circles: [], posts: [], people: [] });
});
