import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { CreateReactionRequest, Reaction, NotificationPayload } from '@pm-operator/api';
import { POINT_WEIGHTS, DAILY_CAPS } from '@pm-operator/api';
import { toISO } from './shared';
import { insertNotification } from './notifications';
import { awardPoints, trackDailyStat } from './points';

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

  type ToggleRow = {
    id: string;
    user_id: string;
    target_type: 'post' | 'comment';
    target_id: string;
    reaction_type: 'like' | 'celebrate';
    created_at: Date;
    action: 'created' | 'removed';
  };

  const rows = await db.execute<ToggleRow>(sql`
    WITH existing AS (
      DELETE FROM ${schema.reactions}
      WHERE ${schema.reactions.userId} = ${userId}
        AND ${schema.reactions.targetType} = ${input.targetType}
        AND ${schema.reactions.targetId} = ${input.targetId}
      RETURNING id, user_id, target_type, target_id, reaction_type, created_at, 'removed'::text AS action
    ),
    inserted AS (
      INSERT INTO ${schema.reactions} (id, user_id, target_type, target_id, reaction_type, created_at)
      SELECT gen_random_uuid(), ${userId}, ${input.targetType}, ${input.targetId}, ${input.reactionType}, now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id, user_id, target_type, target_id, reaction_type, created_at, 'created'::text AS action
    )
    SELECT * FROM existing
    UNION ALL
    SELECT * FROM inserted
  `);

  const row = rows[0];
  if (!row) throw new Error('Failed to toggle reaction');

  const created = row.action === 'created';

  if (created) {
    // Cap like_given points via daily stats. Use the target id as the source
    // so liking/unliking the same target cannot create duplicate point events.
    await trackDailyStat(
      db,
      userId,
      'likes_given',
      {
        countCap: DAILY_CAPS.likesGivenCount,
        pointsCap: DAILY_CAPS.likesGivenPoints,
        pointsPerAction: POINT_WEIGHTS.like_given,
      },
      input.targetId
    );

    let targetAuthorId: string | null = null;
    let groupId: string | null = null;
    let postSlug: string | null = null;
    let groupSlug: string | null = null;

    if (input.targetType === 'post') {
      const post = await db.query.posts.findFirst({
        where: eq(schema.posts.id, input.targetId),
        columns: { authorId: true, groupId: true, slug: true },
      });
      if (post) {
        targetAuthorId = post.authorId;
        groupId = post.groupId;
        postSlug = post.slug;
        const group = await db.query.groups.findFirst({
          where: eq(schema.groups.id, post.groupId),
          columns: { slug: true },
        });
        groupSlug = group?.slug ?? null;
      }
    } else {
      const comment = await db.query.comments.findFirst({
        where: eq(schema.comments.id, input.targetId),
        columns: { authorId: true, postId: true },
      });
      if (comment) {
        targetAuthorId = comment.authorId;
        const post = await db.query.posts.findFirst({
          where: eq(schema.posts.id, comment.postId),
          columns: { groupId: true, slug: true },
        });
        if (post) {
          groupId = post.groupId;
          postSlug = post.slug;
          const group = await db.query.groups.findFirst({
            where: eq(schema.groups.id, post.groupId),
            columns: { slug: true },
          });
          groupSlug = group?.slug ?? null;
        }
      }
    }

    if (targetAuthorId && targetAuthorId !== userId) {
      await awardPoints(db, {
        userId: targetAuthorId,
        eventType: 'like_received',
        points: POINT_WEIGHTS.like_received,
        sourceId: row.id,
        groupId,
        context: {
          targetType: input.targetType,
          targetId: input.targetId,
          reactorId: userId,
        },
      });

      // Notify the target author.
      const payload: NotificationPayload =
        input.targetType === 'post'
          ? { postId: input.targetId }
          : {
              postId: (await db.query.comments.findFirst({ where: eq(schema.comments.id, input.targetId), columns: { postId: true } }))?.postId,
              commentId: input.targetId,
            };
      if (postSlug) payload.postSlug = postSlug;
      if (groupSlug) payload.groupSlug = groupSlug;
      await insertNotification(db, {
        userId: targetAuthorId,
        actorId: userId,
        type: 'reaction',
        payload,
      });
    }
  }

  return {
    reaction: created
      ? {
          id: row.id,
          userId: row.user_id,
          targetType: row.target_type,
          targetId: row.target_id,
          reactionType: row.reaction_type,
          createdAt: toISO(row.created_at),
        }
      : null,
    created,
  };
}
