import { sql, eq, and, gte, isNotNull, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import {
  badgeCriteriaSchema,
  type BadgeCriteria,
  type StreakBadgeCriteria,
  type PointEventType,
  type UserBadgesResponse,
} from '@pm-operator/api';
import { getCachedBadgeCatalog } from './badges-catalog-cache';
import { toISO, toNumber } from './shared';

type CountingCriteria = Exclude<BadgeCriteria, StreakBadgeCriteria>;

function isStreakCriteria(criteria: BadgeCriteria): criteria is StreakBadgeCriteria {
  return 'type' in criteria && criteria.type === 'streak';
}

/**
 * All users qualifying for a badge criteria. Used by the auto-grant cron
 * (app/api/v1/admin/jobs/grant-badges/route.ts); countForUser below mirrors
 * these queries scoped to a single user for progress display.
 */
export async function findQualifyingUsers(
  db: DrizzleClient,
  criteria: BadgeCriteria
): Promise<string[]> {
  if (isStreakCriteria(criteria)) {
    // Earned against the longest streak ever, not the current one.
    const rows = await db
      .select({ userId: schema.users.id })
      .from(schema.users)
      .where(gte(schema.users.longestStreakDays, criteria.days));
    return rows.map((r) => r.userId);
  }

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

// Single-user progress count. Same query shapes as findQualifyingUsers,
// scoped to one user and without the threshold cutoff.
async function countForUser(
  db: DrizzleClient,
  userId: string,
  criteria: CountingCriteria
): Promise<number> {
  const eventType = criteria.eventType as PointEventType;
  const postType = 'postType' in criteria ? criteria.postType : undefined;
  const groupSlug = 'groupSlug' in criteria ? criteria.groupSlug : undefined;

  if (eventType === 'topic_created') {
    const conditions = [
      eq(schema.posts.authorId, userId),
      eq(schema.posts.status, 'published'),
    ];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ value: count() })
      .from(schema.posts)
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions));
    return toNumber(rows[0]?.value);
  }

  if (eventType === 'comment_created') {
    const conditions = [
      eq(schema.comments.authorId, userId),
      eq(schema.comments.status, 'published'),
    ];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ value: count() })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions));
    return toNumber(rows[0]?.value);
  }

  if (eventType === 'solution_accepted') {
    const conditions = [
      eq(schema.comments.authorId, userId),
      eq(schema.comments.status, 'published'),
      isNotNull(schema.posts.acceptedCommentId),
      eq(schema.posts.acceptedCommentId, schema.comments.id),
    ];
    if (postType) conditions.push(eq(schema.posts.type, postType));
    if (groupSlug) conditions.push(eq(schema.groups.slug, groupSlug));

    const rows = await db
      .select({ value: count() })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(and(...conditions));
    return toNumber(rows[0]?.value);
  }

  const conditions = [
    eq(schema.pointEvents.userId, userId),
    eq(schema.pointEvents.eventType, eventType),
  ];
  if (groupSlug) {
    const rows = await db
      .select({ value: count() })
      .from(schema.pointEvents)
      .innerJoin(schema.groups, eq(schema.pointEvents.groupId, schema.groups.id))
      .where(and(...conditions, eq(schema.groups.slug, groupSlug)));
    return toNumber(rows[0]?.value);
  }

  const rows = await db
    .select({ value: count() })
    .from(schema.pointEvents)
    .where(and(...conditions));
  return toNumber(rows[0]?.value);
}

export async function getUserBadges(
  db: DrizzleClient,
  userId: string
): Promise<UserBadgesResponse> {
  // The catalog is viewer-independent, so it is served from the shared 300 s
  // cache: 0 queries warm, 1 cold. Awaited ALONE and BEFORE the wave below —
  // never inside it — so a cold cache adds a sequential step instead of
  // widening the wave. That drops this function from 3 concurrent queries to
  // 2, which is the whole page-side budget once the community layout's rail
  // query (1, concurrent with the page) is counted against the pool of 3.
  const catalog = await getCachedBadgeCatalog();

  const [user, userBadgeRows] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { streakDays: true },
    }),
    db.query.userBadges.findMany({
      where: eq(schema.userBadges.userId, userId),
    }),
  ]);

  const earnedByBadgeId = new Map(userBadgeRows.map((row) => [row.badgeId, row]));

  const earned: UserBadgesResponse['earned'] = [];
  const progress: UserBadgesResponse['progress'] = [];

  for (const { badge, criteria } of catalog) {
    const earnedRow = earnedByBadgeId.get(badge.id);
    if (earnedRow) {
      earned.push({ badge, awardedAt: toISO(earnedRow.awardedAt) });
      continue;
    }

    // Badges with free-form criteria (e.g. manually awarded ones) have no
    // computable progress; skip them until they are earned.
    const parsed = badgeCriteriaSchema.safeParse(criteria);
    if (!parsed.success) continue;

    if (isStreakCriteria(parsed.data)) {
      progress.push({
        badge,
        current: Math.min(user?.streakDays ?? 0, parsed.data.days),
        threshold: parsed.data.days,
      });
      continue;
    }

    // N+1, kept sequential on purpose: one query per badge with computable
    // criteria, awaited one at a time so it can never breach the pool.
    const current = await countForUser(db, userId, parsed.data);
    progress.push({
      badge,
      current: Math.min(current, parsed.data.threshold),
      threshold: parsed.data.threshold,
    });
  }

  return { earned, progress };
}
