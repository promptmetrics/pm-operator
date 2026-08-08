import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { adminDashboardSchema } from '@pm-operator/api';
import { getAdminDashboard } from '../lib/services/analytics';
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
