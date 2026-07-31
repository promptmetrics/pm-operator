export const runtime = 'nodejs';

import { sql, eq, and, isNotNull, count } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import type { DrizzleClient } from '@pm-operator/db';
import { badgeCriteriaSchema, type BadgeCriteria, type PointEventType } from '@pm-operator/api';
import { getDb, ok, forbidden } from '@/lib/api/server';
import { insertNotification } from '@/lib/services/notifications';

function authorizeCron(request: Request): Response | null {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const authorization = request.headers.get('authorization');
  if (authorization !== expected) {
    return forbidden('Unauthorized');
  }
  return null;
}

async function findQualifyingUsers(
  db: DrizzleClient,
  criteria: BadgeCriteria
): Promise<string[]> {
  const eventType = criteria.eventType as PointEventType;
  const postType = 'postType' in criteria ? criteria.postType : undefined;
  const groupSlug = 'groupSlug' in criteria ? criteria.groupSlug : undefined;

  if (eventType === 'topic_created') {
    const conditions = [eq(schema.posts.status, 'published')];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ userId: schema.posts.authorId })
      .from(schema.posts)
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions))
      .groupBy(schema.posts.authorId)
      .having(sql`count(*) >= ${criteria.threshold}`);
    return rows.map((r) => r.userId);
  }

  if (eventType === 'comment_created') {
    const conditions = [eq(schema.comments.status, 'published')];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ userId: schema.comments.authorId })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions))
      .groupBy(schema.comments.authorId)
      .having(sql`count(*) >= ${criteria.threshold}`);
    return rows.map((r) => r.userId);
  }

  if (eventType === 'solution_accepted') {
    const conditions = [
      eq(schema.comments.status, 'published'),
      isNotNull(schema.posts.acceptedCommentId),
      eq(schema.posts.acceptedCommentId, schema.comments.id),
    ];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ userId: schema.comments.authorId })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions))
      .groupBy(schema.comments.authorId)
      .having(sql`count(*) >= ${criteria.threshold}`);
    return rows.map((r) => r.userId);
  }

  // Remaining event types are counted from point_events.
  const conditions = [eq(schema.pointEvents.eventType, eventType)];
  if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

  const query = db
    .select({ userId: schema.pointEvents.userId })
    .from(schema.pointEvents)
    .where(and(...conditions));

  const rows = groupSlug
    ? await query
        .innerJoin(schema.groups, eq(schema.pointEvents.groupId, schema.groups.id))
        .groupBy(schema.pointEvents.userId)
        .having(sql`count(*) >= ${criteria.threshold}`)
    : await query.groupBy(schema.pointEvents.userId).having(sql`count(*) >= ${criteria.threshold}`);

  return rows.map((r) => r.userId);
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const badges = await getDb().query.badges.findMany();
  let awarded = 0;

  for (const badge of badges) {
    const parsed = badgeCriteriaSchema.safeParse(badge.criteria);
    if (!parsed.success) continue;

    const userIds = await findQualifyingUsers(getDb(), parsed.data);

    for (const userId of userIds) {
      const [userBadge] = await getDb().transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.userBadges)
          .values({
            userId,
            badgeId: badge.id,
            awardedBy: null,
            context: { criteria: parsed.data },
          })
          .onConflictDoNothing({
            target: [schema.userBadges.userId, schema.userBadges.badgeId],
          })
          .returning();

        if (inserted) {
          await insertNotification(tx, {
            userId,
            actorId: null,
            type: 'badge',
            payload: { badgeSlug: badge.slug, badgeName: badge.name },
          });
        }

        return [inserted];
      });

      if (userBadge) awarded++;
    }
  }

  return ok({ awarded });
}
