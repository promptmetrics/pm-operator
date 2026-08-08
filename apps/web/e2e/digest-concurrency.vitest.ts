import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { eq } from 'drizzle-orm';
import { groups } from '@pm-operator/db';
import { getWeeklyDigest } from '../lib/services/digest';
import {
  serviceDb,
  createTestUser,
  createInviteOnlyGroup,
  createPublishedPost,
  deleteTestUser,
} from './helpers';

const db = serviceDb();

// Concurrency budget guard (track 2D): getWeeklyDigest runs 3 sequential
// waves and no wave may exceed 3 concurrent DB queries — the per-instance
// pool is 3, and a wider Promise.all starves it instead of queueing
// (2026-08-02 incident). Every drizzle query funnels through the postgres-js
// session's prepareQuery(...).execute(), so wrapping execute with an
// in-flight counter measures true peak concurrency: Promise.all invokes each
// query's execute synchronously, so the counter reaches the wave's real
// width before the first query resolves.
const counter = { inFlight: 0, max: 0 };
{
  const session = (
    db as unknown as {
      session: { prepareQuery: (...args: unknown[]) => { execute: (...args: unknown[]) => Promise<unknown> } };
    }
  ).session;
  const originalPrepare = session.prepareQuery.bind(session);
  session.prepareQuery = (...args: unknown[]) => {
    const prepared = originalPrepare(...args);
    const originalExecute = prepared.execute.bind(prepared);
    prepared.execute = async (...executeArgs: unknown[]) => {
      counter.inFlight++;
      counter.max = Math.max(counter.max, counter.inFlight);
      try {
        return await originalExecute(...executeArgs);
      } finally {
        counter.inFlight--;
      }
    };
    return prepared;
  };
}

test(
  'getWeeklyDigest never exceeds 3 concurrent queries per wave and keeps the additive payload',
  async () => {
    const author = await createTestUser({ onboardingComplete: true });
    let groupId: string | undefined;
    try {
      const group = await createInviteOnlyGroup(author.id);
      groupId = group.id;
      const postId = await createPublishedPost(group.id, author.id);

      // Viewer-scoped: wave 1 resolves the author's single circle, waves 2-3
      // fan out at most 3 wide.
      counter.max = 0;
      const scoped = await getWeeklyDigest(db, undefined, author.id);
      expect(counter.max).toBeLessThanOrEqual(3);

      // The 5 pre-2D scalars stay present (email cron + /digest page contract).
      expect(typeof scoped.posts).toBe('number');
      expect(typeof scoped.solutionsAccepted).toBe('number');
      expect(typeof scoped.hotTopicName).toBe('string');
      expect(typeof scoped.hotTopicUrl).toBe('string');
      expect(typeof scoped.topContributors).toBe('string');

      // Additive enrichment: counts and section items scoped to the viewer's
      // only circle, shaped {id, title, authorName, circleName, stat}.
      expect(scoped.posts).toBeGreaterThanOrEqual(1);
      expect(scoped.newMembers).toBeGreaterThanOrEqual(1);
      const topPost = scoped.topPosts.find((p) => p.id === postId);
      expect(topPost).toBeDefined();
      expect(topPost!.title).toContain('Test post');
      expect(topPost!.circleName).toContain('Invite-only');
      expect(typeof topPost!.authorName).toBe('string');
      expect(topPost!.stat).toBe(0);
      expect(scoped.topPosts.length).toBeLessThanOrEqual(3);
      expect(scoped.newBuilds.length).toBeLessThanOrEqual(3);
      expect(scoped.unansweredQuestions.length).toBeLessThanOrEqual(3);

      // Viewerless (community-wide) path used by the /digest page and the
      // Monday cron obeys the same budget.
      counter.max = 0;
      const communityWide = await getWeeklyDigest(db);
      expect(counter.max).toBeLessThanOrEqual(3);
      expect(communityWide.posts).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(communityWide.topPosts)).toBe(true);
    } finally {
      // Deleting the user cascades to posts/memberships/point events;
      // groups.created_by is SET NULL, so the group needs an explicit delete.
      await deleteTestUser(author.id).catch(() => {});
      if (groupId) {
        await db.delete(groups).where(eq(groups.id, groupId)).catch(() => {});
      }
    }
  },
  { timeout: 60_000 }
);
