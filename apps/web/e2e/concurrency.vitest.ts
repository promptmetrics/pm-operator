import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { eq, and, count } from 'drizzle-orm';
import { reactions, pointEvents, posts, groups } from '@pm-operator/db';
import { toggleReaction } from '../lib/services/reactions';
import {
  serviceDb,
  createTestUser,
  createInviteOnlyGroup,
  addGroupMember,
  createPublishedPost,
  deleteTestUser,
} from './helpers';

const db = serviceDb();

test(
  '100 concurrent reactions on the same target produce no duplicate point events',
  async () => {
    const author = await createTestUser({ onboardingComplete: true });
    const likers: Awaited<ReturnType<typeof createTestUser>>[] = [];
    let groupId: string | undefined;
    try {
      const group = await createInviteOnlyGroup(author.id);
      groupId = group.id;
      const postId = await createPublishedPost(group.id, author.id);

      likers.push(
        ...(await Promise.all(
          Array.from({ length: 100 }, () => createTestUser({ onboardingComplete: true }))
        ))
      );

      await Promise.all(likers.map((u) => addGroupMember(group.id, u.id, 'member')));

      await Promise.all(
        likers.map((u) =>
          toggleReaction(db, { targetType: 'post', targetId: postId, reactionType: 'like' }, u.id)
        )
      );

      const reactionRows = await db
        .select({ count: count() })
        .from(reactions)
        .where(and(eq(reactions.targetType, 'post'), eq(reactions.targetId, postId)));
      expect(Number(reactionRows[0].count)).toBe(100);

      const eventRows = await db
        .select({ count: count() })
        .from(pointEvents)
        .where(and(eq(pointEvents.eventType, 'like_given'), eq(pointEvents.sourceId, postId)));
      expect(Number(eventRows[0].count)).toBe(100);

      const postRow = await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: { upvotes: true },
      });
      expect(postRow?.upvotes).toBe(100);
    } finally {
      // Clean up even when an assertion fails. Deleting users cascades to
      // posts/memberships/reactions/point events; groups.created_by is
      // SET NULL, so the group needs an explicit delete.
      await Promise.allSettled([author, ...likers].map((u) => deleteTestUser(u.id)));
      if (groupId) {
        await db.delete(groups).where(eq(groups.id, groupId)).catch(() => {});
      }
    }
  },
  { timeout: 60_000 }
);
