import { sql, eq, and, gte, isNotNull, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import {
  badgeCriteriaSchema,
  type BadgeCriteria,
  type StreakBadgeCriteria,
  type PointEventType,
  type PublicBadge,
  type UserBadgesResponse,
} from '@pm-operator/api';
import { getCachedBadgeCatalog } from './badges-catalog-cache';
import { toISO, toNumber } from './shared';

export type CountingCriteria = Exclude<BadgeCriteria, StreakBadgeCriteria>;

function isStreakCriteria(criteria: BadgeCriteria): criteria is StreakBadgeCriteria {
  return 'type' in criteria && criteria.type === 'streak';
}

/**
 * All users qualifying for a badge criteria. Used by the auto-grant cron
 * (app/api/v1/admin/jobs/grant-badges/route.ts); the bucket queries below
 * mirror these queries scoped to a single user for progress display.
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

// ── Folded progress counts ───────────────────────────────────────────────────
//
// Progress used to cost one count query per unearned badge with computable
// criteria — O(catalog) round trips on the profile and the DevCard. The same
// numbers come out of one GROUPed statement per source table, so the query
// count is now constant no matter how big the badge catalog gets.
//
// Each statement keeps the exact WHERE clause and join shape of the per-badge
// query it replaces; the only change is that the OPTIONAL postType / groupSlug
// predicates move out of the WHERE and into the GROUP BY. A badge's count is
// then the sum of the buckets its filters select, which is the same set of rows
// the old predicate matched.

interface PostBucket {
  postType: string;
  groupSlug: string;
  value: number | string;
}

interface CommentBucket {
  postType: string;
  groupSlug: string;
  comments: number | string;
  solutions: number | string;
}

interface PointEventBucket {
  eventType: string;
  groupSlug: string | null;
  value: number | string;
}

/** topic_created buckets. Mirrors the posts branch of the old countForUser. */
async function postCountBuckets(
  db: DrizzleClient,
  userId: string
): Promise<PostBucket[]> {
  return db
    .select({
      postType: schema.posts.type,
      groupSlug: schema.groups.slug,
      value: count(),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(
      and(
        eq(schema.posts.authorId, userId),
        eq(schema.posts.status, 'published')
      )
    )
    .groupBy(schema.posts.type, schema.groups.slug);
}

/**
 * comment_created AND solution_accepted buckets in one pass. Both branches of
 * the old countForUser started from the same comments→posts→groups join with
 * the same WHERE clause; solution_accepted only added the accepted-comment
 * predicate, which becomes a FILTER on the aggregate rather than a second
 * statement.
 */
async function commentCountBuckets(
  db: DrizzleClient,
  userId: string
): Promise<CommentBucket[]> {
  return db
    .select({
      postType: schema.posts.type,
      groupSlug: schema.groups.slug,
      comments: count(),
      solutions: sql<number>`count(*) FILTER (
        WHERE ${schema.posts.acceptedCommentId} IS NOT NULL
          AND ${schema.posts.acceptedCommentId} = ${schema.comments.id}
      )::int`,
    })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(
      and(
        eq(schema.comments.authorId, userId),
        eq(schema.comments.status, 'published')
      )
    )
    .groupBy(schema.posts.type, schema.groups.slug);
}

/**
 * Buckets for every remaining event type. LEFT JOIN, not INNER: the old
 * no-groupSlug path did not join groups at all, so events with a NULL or
 * unresolvable group_id still counted. A left join keeps exactly one row per
 * event (groups.id is the primary key), with a NULL slug for those — counted
 * when the badge has no groupSlug, excluded when it has one, which is what the
 * old inner join did.
 */
async function pointEventCountBuckets(
  db: DrizzleClient,
  userId: string
): Promise<PointEventBucket[]> {
  return db
    .select({
      eventType: schema.pointEvents.eventType,
      groupSlug: schema.groups.slug,
      value: count(),
    })
    .from(schema.pointEvents)
    .leftJoin(schema.groups, eq(schema.pointEvents.groupId, schema.groups.id))
    .where(eq(schema.pointEvents.userId, userId))
    .groupBy(schema.pointEvents.eventType, schema.groups.slug);
}

/**
 * The number a single countForUser() call used to return, recomputed from the
 * buckets. Filters test `!== undefined` rather than truthiness so an explicit
 * empty-string groupSlug still narrows to nothing, exactly as the old
 * eq(groups.slug, '') did.
 */
export function countFromBuckets(
  criteria: CountingCriteria,
  posts: PostBucket[],
  comments: CommentBucket[],
  pointEvents: PointEventBucket[]
): number {
  const eventType = criteria.eventType as PointEventType;
  const postType = 'postType' in criteria ? criteria.postType : undefined;
  const groupSlug = 'groupSlug' in criteria ? criteria.groupSlug : undefined;

  let total = 0;

  if (eventType === 'topic_created') {
    for (const bucket of posts) {
      if (postType !== undefined && bucket.postType !== postType) continue;
      if (groupSlug !== undefined && bucket.groupSlug !== groupSlug) continue;
      total += toNumber(bucket.value);
    }
    return total;
  }

  if (eventType === 'comment_created' || eventType === 'solution_accepted') {
    for (const bucket of comments) {
      if (postType !== undefined && bucket.postType !== postType) continue;
      if (groupSlug !== undefined && bucket.groupSlug !== groupSlug) continue;
      total += toNumber(
        eventType === 'comment_created' ? bucket.comments : bucket.solutions
      );
    }
    return total;
  }

  // point_events branch: postType was never part of that query, so it stays
  // ignored here too.
  for (const bucket of pointEvents) {
    if (bucket.eventType !== eventType) continue;
    if (groupSlug !== undefined && bucket.groupSlug !== groupSlug) continue;
    total += toNumber(bucket.value);
  }
  return total;
}

/** Which bucket statements a set of unearned counting criteria actually needs. */
export function requiredBuckets(criteria: CountingCriteria[]): {
  posts: boolean;
  comments: boolean;
  pointEvents: boolean;
} {
  const types = criteria.map((c) => c.eventType as PointEventType);
  return {
    posts: types.includes('topic_created'),
    comments:
      types.includes('comment_created') || types.includes('solution_accepted'),
    pointEvents: types.some(
      (type) =>
        type !== 'topic_created' &&
        type !== 'comment_created' &&
        type !== 'solution_accepted'
    ),
  };
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

  // Three sequential waves of at most 2: [user, userBadges], then the post and
  // comment buckets, then the point_events bucket. At most 5 queries for any
  // catalog size — this used to be 2 + one query per unearned computable badge.
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
  // Catalog order is preserved: `pending` is filled in catalog order and the
  // progress list is built from it below, so the response ordering is the same
  // one the single-pass loop produced.
  const pending: { badge: PublicBadge; criteria: BadgeCriteria }[] = [];

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

    pending.push({ badge, criteria: parsed.data });
  }

  // Only the source tables an unearned badge actually needs get queried, so a
  // catalog of streak-only (or fully earned) badges still costs 0 extra
  // queries — same as before, when those badges issued no query either.
  const needed = requiredBuckets(
    pending
      .map((item) => item.criteria)
      .filter((criteria): criteria is CountingCriteria => !isStreakCriteria(criteria))
  );

  // Wave 2 (at most 2 queries): the post- and comment-derived buckets. Two, not
  // three, because the community layout's rail query runs concurrently with the
  // page against the same pool of 3.
  const [postBuckets, commentBuckets] = await Promise.all([
    needed.posts ? postCountBuckets(db, userId) : [],
    needed.comments ? commentCountBuckets(db, userId) : [],
  ]);

  // Wave 3 (at most 1 query): the point_events buckets.
  const pointEventBuckets = needed.pointEvents
    ? await pointEventCountBuckets(db, userId)
    : [];

  const progress: UserBadgesResponse['progress'] = [];

  for (const { badge, criteria } of pending) {
    if (isStreakCriteria(criteria)) {
      progress.push({
        badge,
        current: Math.min(user?.streakDays ?? 0, criteria.days),
        threshold: criteria.days,
      });
      continue;
    }

    const current = countFromBuckets(
      criteria,
      postBuckets,
      commentBuckets,
      pointEventBuckets
    );
    progress.push({
      badge,
      current: Math.min(current, criteria.threshold),
      threshold: criteria.threshold,
    });
  }

  return { earned, progress };
}
