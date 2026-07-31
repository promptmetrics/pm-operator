import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { CreateReactionRequest, Reaction } from '@pm-operator/api';
import { toISO } from './shared';
import { insertNotification } from './notifications';
import { trackDailyStat } from './points';

async function canSeeTarget(
  db: DrizzleClient,
  targetType: string,
  targetId: string,
  userId: string
): Promise<boolean> {
  if (targetType === 'post') {
    const row = await db.query.posts.findFirst({
      where: eq(schema.posts.id, targetId),
      columns: { groupId: true, authorId: true, status: true },
    });
    if (!row || row.status === 'deleted') return false;
    return Boolean(
      await db.query.groupMemberships.findFirst({
        where: and(
          eq(schema.groupMemberships.groupId, row.groupId),
          eq(schema.groupMemberships.userId, userId)
        ),
      })
    );
  }
  if (targetType === 'comment') {
    const comment = await db.query.comments.findFirst({
      where: eq(schema.comments.id, targetId),
      columns: { postId: true, status: true },
    });
    if (!comment || comment.status === 'deleted') return false;
    return canSeeTarget(db, 'post', comment.postId, userId);
  }
  return false;
}

export async function toggleReaction(
  db: DrizzleClient,
  input: CreateReactionRequest,
  userId: string
): Promise<{ reaction: Reaction | null; created: boolean }> {
  const canSee = await canSeeTarget(db, input.targetType, input.targetId, userId);
  if (!canSee) throw new Error('Target not found');

  const existing = await db.query.reactions.findFirst({
    where: and(
      eq(schema.reactions.userId, userId),
      eq(schema.reactions.targetType, input.targetType),
      eq(schema.reactions.targetId, input.targetId)
    ),
  });

  if (existing) {
    await db
      .delete(schema.reactions)
      .where(eq(schema.reactions.id, existing.id));
    return { reaction: null, created: false };
  }

  const [reaction] = await db
    .insert(schema.reactions)
    .values({
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reactionType: input.reactionType,
    })
    .returning();

  if (!reaction) throw new Error('Failed to create reaction');

  // Cap like_given points via daily stats. Use the target id as the source
  // so liking/unliking the same target cannot create duplicate point events.
  await trackDailyStat(
    db,
    userId,
    'likes_given',
    {
      countCap: 50,
      pointsCap: 50,
      pointsPerAction: 1,
    },
    input.targetId
  );

  // Notify the target author.
  if (input.targetType === 'post') {
    const post = await db.query.posts.findFirst({
      where: eq(schema.posts.id, input.targetId),
      columns: { authorId: true },
    });
    if (post && post.authorId !== userId) {
      await insertNotification(db, {
        userId: post.authorId,
        actorId: userId,
        type: 'reaction',
        payload: { postId: input.targetId },
      });
    }
  } else if (input.targetType === 'comment') {
    const comment = await db.query.comments.findFirst({
      where: eq(schema.comments.id, input.targetId),
      columns: { authorId: true, postId: true },
    });
    if (comment && comment.authorId !== userId) {
      await insertNotification(db, {
        userId: comment.authorId,
        actorId: userId,
        type: 'reaction',
        payload: { postId: comment.postId, commentId: input.targetId },
      });
    }
  }

  return {
    reaction: {
      id: reaction.id,
      userId: reaction.userId,
      targetType: reaction.targetType,
      targetId: reaction.targetId,
      reactionType: reaction.reactionType,
      createdAt: toISO(reaction.createdAt),
    },
    created: true,
  };
}
