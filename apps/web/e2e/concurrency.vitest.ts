import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { eq, and, count } from 'drizzle-orm';
import { reactions, pointEvents, posts } from '@pm-operator/db';
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
    const { id: groupId } = await createInviteOnlyGroup(author.id);
    const postId = await createPublishedPost(groupId, author.id);

    const likers = await Promise.all(
      Array.from({ length: 100 }, () => createTestUser({ onboardingComplete: true }))
    );

    await Promise.all(likers.map((u) => addGroupMember(groupId, u.id, 'member')));

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

    await deleteTestUser(author.id);
    await Promise.all(likers.map((u) => deleteTestUser(u.id)));
  },
  { timeout: 60_000 }
);
