import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { adminDashboardSchema } from '@pm-operator/api';
import { getAdminDashboard, getAnalyticsOverview } from '../lib/services/analytics';
import {
  serviceDb,
  createTestUser,
  createInviteOnlyGroup,
  deleteTestUser,
} from './helpers';

const db = serviceDb();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * getAnalyticsOverview goes through db.select(), not db.execute(), so it needs
 * its own instrument. Only the three members that function touches are wrapped
 * — .from(), .where() and the thenable — and the query does not run until the
 * wrapper's `then` is called, which is exactly where the in-flight count moves.
 */
function instrumentSelect(target: typeof db) {
  let inFlight = 0;
  let maxInFlight = 0;
  let totalQueries = 0;

  function wrapBuilder(builder: PromiseLike<unknown>): unknown {
    const inner = builder as unknown as Record<string, (...args: unknown[]) => unknown>;
    return {
      from: (...args: unknown[]) =>
        wrapBuilder(inner.from(...args) as PromiseLike<unknown>),
      where: (...args: unknown[]) =>
        wrapBuilder(inner.where(...args) as PromiseLike<unknown>),
      then: (onOk: unknown, onErr: unknown) => {
        totalQueries += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return Promise.resolve(builder)
          .finally(() => {
            inFlight -= 1;
          })
          .then(
            onOk as (value: unknown) => unknown,
            onErr as (reason: unknown) => unknown
          );
      },
    };
  }

  const instrumented = new Proxy(target, {
    get(proxyTarget, prop) {
      const value = (proxyTarget as unknown as Record<PropertyKey, unknown>)[prop];
      if (prop === 'select' && typeof value === 'function') {
        return (...args: unknown[]) =>
          wrapBuilder(
            (value as (...a: unknown[]) => PromiseLike<unknown>).apply(proxyTarget, args)
          );
      }
      return typeof value === 'function' ? value.bind(proxyTarget) : value;
    },
  }) as typeof db;

  return { instrumented, stats: () => ({ totalQueries, maxInFlight }) };
}

test(
  'getAnalyticsOverview never opens more than 3 concurrent queries',
  async () => {
    // Read-only: no fixtures, it just counts whatever is already there.
    const { instrumented, stats } = instrumentSelect(db);

    const overview = await getAnalyticsOverview(instrumented);

    // Seven counters, unchanged — but in waves of 3 / 3 / 1 rather than one
    // 7-wide Promise.all, which starved the pool of 3 rather than queueing
    // (MEMORY: DB pool starvation trap, 2026-08-02 outage). The wave WIDTHS are
    // additionally pinned by the source scan in query-budget-units.vitest.ts,
    // which needs no database.
    expect(stats().totalQueries).toBe(7);
    expect(stats().maxInFlight).toBeLessThanOrEqual(3);

    // Same object, field for field, as the admin KpiCards already consume.
    expect(Object.keys(overview).sort()).toEqual([
      'activeMembers7d',
      'newMembers30d',
      'pendingFlags',
      'totalCircles',
      'totalComments',
      'totalMembers',
      'totalPosts',
    ]);
    for (const [key, value] of Object.entries(overview)) {
      expect(`${key}:${Number.isInteger(value) && value >= 0}`).toBe(`${key}:true`);
    }
    expect(overview.activeMembers7d).toBeLessThanOrEqual(overview.totalMembers);
    expect(overview.newMembers30d).toBeLessThanOrEqual(overview.totalMembers);
  },
  { timeout: 60_000 }
);

test(
  'getAdminDashboard runs two sequential waves of at most 3 concurrent queries',
  async () => {
    const author = await createTestUser({ onboardingComplete: true });
    let groupId: string | undefined;
    let flagId: string | undefined;
    const answeredQuestionId = randomUUID();
    const staleQuestionId = randomUUID();
    try {
      const group = await createInviteOnlyGroup(author.id);
      groupId = group.id;

      const answeredAt = daysAgo(10);
      await db.insert(schema.posts).values([
        {
          id: answeredQuestionId,
          groupId,
          authorId: author.id,
          slug: `q-${answeredQuestionId.slice(0, 8)}`,
          title: 'Prior-week question (answered)',
          content: '<p>q</p>',
          contentPlain: 'q',
          type: 'question',
          status: 'published',
          tags: [],
          createdAt: answeredAt,
        },
        {
          id: staleQuestionId,
          groupId,
          authorId: author.id,
          slug: `q-${staleQuestionId.slice(0, 8)}`,
          title: 'Unanswered question',
          content: '<p>q</p>',
          contentPlain: 'q',
          type: 'question',
          status: 'published',
          tags: [],
          createdAt: daysAgo(3),
        },
      ]);
      await db.insert(schema.comments).values({
        postId: answeredQuestionId,
        authorId: author.id,
        content: '<p>a</p>',
        contentPlain: 'a',
        status: 'published',
        createdAt: new Date(answeredAt.getTime() + 2 * 60 * 60 * 1000),
      });
      const [flag] = await db
        .insert(schema.flags)
        .values({
          targetType: 'post',
          targetId: staleQuestionId,
          reporterId: author.id,
          reason: 'Admin dashboard concurrency test',
          status: 'open',
        })
        .returning({ id: schema.flags.id });
      flagId = flag?.id;

      // Instrument db.execute to measure the in-flight query count. All six
      // dashboard queries go through execute(); the pool budget rule (max 3,
      // DB pool starvation trap) means the high-water mark must never pass 3
      // and the two waves must be sequential.
      let inFlight = 0;
      let maxInFlight = 0;
      let totalQueries = 0;
      const instrumented = new Proxy(db, {
        get(target, prop) {
          const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
          if (prop !== 'execute' || typeof value !== 'function') {
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return (...args: unknown[]) => {
            totalQueries += 1;
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return Promise.resolve(
              (value as (...a: unknown[]) => unknown).apply(target, args)
            ).finally(() => {
              inFlight -= 1;
            });
          };
        },
      }) as typeof db;

      const dashboard = await getAdminDashboard(instrumented);

      // Concurrency budget: two waves of 3, never overlapping. A merged
      // 6-wide Promise.all would push maxInFlight to 6 and fail here.
      expect(totalQueries).toBe(6);
      expect(maxInFlight).toBeLessThanOrEqual(3);

      // Response conforms to the packages/api contract.
      const parsed = adminDashboardSchema.parse(dashboard);
      expect(parsed.postsPerDay).toHaveLength(7);

      // Seeded rows surface in the aggregates and the attention feed.
      expect(parsed.weekly.postsCreated.prior).toBeGreaterThanOrEqual(1);
      expect(parsed.weekly.postsCreated.current).toBeGreaterThanOrEqual(1);
      expect(parsed.weekly.medianTimeToFirstAnswerSeconds.prior).not.toBeNull();
      expect(
        parsed.needsAttention.some(
          (item) => item.kind === 'open_flag' && item.id === flagId
        )
      ).toBe(true);
      expect(
        parsed.needsAttention.some(
          (item) =>
            item.kind === 'unanswered_question' && item.id === staleQuestionId
        )
      ).toBe(true);

      // Onboarding pill + acquisition source. Parallel test files may push the
      // author out of the top-8 newest members, so only assert when present.
      const authorRow = parsed.newestMembers.find((m) => m.id === author.id);
      if (authorRow) {
        expect(authorRow.onboarding).toBe('onboarded');
        expect(authorRow.source).toBe('invite');
      }
    } finally {
      if (flagId) {
        await db.delete(schema.flags).where(eq(schema.flags.id, flagId)).catch(() => {});
      }
      await deleteTestUser(author.id).catch(() => {});
      if (groupId) {
        await db.delete(schema.groups).where(eq(schema.groups.id, groupId)).catch(() => {});
      }
    }
  },
  { timeout: 60_000 }
);
