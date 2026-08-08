import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { listGroups, listGroupStats } from '../lib/services/groups';
import {
  serviceDb,
  createTestUser,
  createPublishedPost,
  createHiddenPost,
  deleteTestUser,
  slugify,
} from './helpers';

const db = serviceDb();

interface QueryCounters {
  inFlight: number;
  peak: number;
  total: number;
}

// Counts in-flight queries on a postgres.js client by wrapping `unsafe` (the
// single entry point drizzle-orm/postgres-js uses to execute SQL). A query is
// counted from dispatch until its awaited promise settles, so `peak` is an
// upper bound on true wire concurrency — conservative in the direction the
// pool-starvation budget cares about (pool = 3; see DB pool starvation trap).
function instrument(sqlClient: ReturnType<typeof createDrizzleClient>['sql']): QueryCounters {
  const counters: QueryCounters = { inFlight: 0, peak: 0, total: 0 };
  const origUnsafe = sqlClient.unsafe.bind(sqlClient);

  sqlClient.unsafe = ((query: string, params?: unknown[], options?: unknown) => {
    counters.total++;
    counters.inFlight++;
    counters.peak = Math.max(counters.peak, counters.inFlight);

    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        counters.inFlight--;
      }
    };

    // postgres.js queries are lazy thenables, and drizzle sometimes derives a
    // second thenable (e.g. `.values()`) before awaiting. Wrap every thenable
    // in the chain so whichever one drizzle awaits settles the counter.
    const wrap = (target: unknown): unknown =>
      new Proxy(target as object, {
        get(t, prop) {
          if (prop === 'then') {
            return (
              onFulfilled?: (value: unknown) => unknown,
              onRejected?: (error: unknown) => unknown
            ) =>
              (t as PromiseLike<unknown>).then(
                (value) => {
                  settle();
                  return onFulfilled ? onFulfilled(value) : value;
                },
                (error) => {
                  settle();
                  if (onRejected) return onRejected(error);
                  throw error;
                }
              );
          }
          const value = Reflect.get(t, prop, t);
          if (typeof value === 'function') {
            return (...args: unknown[]) => {
              const result = value.apply(t, args);
              return result && typeof result.then === 'function' ? wrap(result) : result;
            };
          }
          return value;
        },
      });

    return wrap(
      origUnsafe(query, params as never, options as never)
    );
  }) as unknown as typeof sqlClient.unsafe;

  return counters;
}

test(
  'groups list with stats stays within the 3-query concurrency budget and aggregates correctly',
  async () => {
    const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
    let groupId: string | undefined;
    let instrumented: ReturnType<typeof createDrizzleClient> | undefined;
    try {
      const groupSlug = slugify('stats-public');
      const [group] = await db
        .insert(schema.groups)
        .values({
          slug: groupSlug,
          name: `Stats ${groupSlug}`,
          visibility: 'public',
          color: '#000000',
          createdBy: admin.id,
        })
        .returning();
      if (!group) throw new Error('Failed to create group');
      groupId = group.id;

      // 3 published posts (all recent → postsThisMonth): 1 discussion,
      // 1 solved question, 1 unsolved question → solvedRate 0.5. Plus a
      // hidden post that the shared aggregate must NOT count.
      await createPublishedPost(group.id, admin.id, 'Stats discussion');

      const makeQuestion = async (title: string): Promise<string> => {
        const id = randomUUID();
        const [post] = await db
          .insert(schema.posts)
          .values({
            id,
            groupId: group.id,
            authorId: admin.id,
            slug: `q-${id.slice(0, 8)}`,
            title,
            content: '<p>Question body</p>',
            contentPlain: 'Question body',
            type: 'question',
            status: 'published',
            tags: [],
          })
          .returning();
        if (!post) throw new Error('Failed to create question');
        return post.id;
      };

      const solvedId = await makeQuestion('Solved question');
      const [answer] = await db
        .insert(schema.comments)
        .values({
          postId: solvedId,
          authorId: admin.id,
          content: '<p>Answer</p>',
          contentPlain: 'Answer',
        })
        .returning();
      if (!answer) throw new Error('Failed to create answer comment');
      await db
        .update(schema.posts)
        .set({ acceptedCommentId: answer.id })
        .where(eq(schema.posts.id, solvedId));

      await makeQuestion('Unsolved question');
      await createHiddenPost(group.id, admin.id);

      instrumented = createDrizzleClient({
        databaseUrl: process.env.DATABASE_URL!.trim(),
      });
      const counters = instrument(instrumented.sql);

      // Cold path (unstable_cache miss): viewer-scoped base list, then the
      // shared stats aggregate — exactly 2 queries, strictly sequential.
      const groups = await listGroups(instrumented.db, admin.id);
      const statsMap = await listGroupStats(instrumented.db);

      expect(counters.total).toBe(2);
      expect(counters.peak).toBeLessThanOrEqual(3);
      expect(counters.peak).toBe(1);
      expect(counters.inFlight).toBe(0);

      // Warm path (unstable_cache hit in the route): only the viewer-specific
      // base query runs per navigation.
      counters.total = 0;
      counters.peak = 0;
      await listGroups(instrumented.db, admin.id);
      expect(counters.total).toBe(1);
      expect(counters.peak).toBeLessThanOrEqual(3);

      // Correctness: hidden post excluded, solvedRate = 1 solved / 2 questions.
      const listed = groups.find((g) => g.id === group.id);
      expect(listed).toBeDefined();
      const stats = statsMap[group.id];
      expect(stats).toBeDefined();
      expect(stats!.postsThisMonth).toBe(3);
      expect(stats!.solvedRate).toBe(0.5);
    } finally {
      await instrumented?.sql.end().catch(() => {});
      await deleteTestUser(admin.id).catch(() => {});
      if (groupId) {
        await db.delete(schema.groups).where(eq(schema.groups.id, groupId)).catch(() => {});
      }
    }
  },
  { timeout: 60_000 }
);
