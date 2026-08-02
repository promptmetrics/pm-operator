// Weekly community digest aggregation (T8.3). Computes the summary shown in the
// /feed banner, the /digest page, and the Monday weekly-digest email.
//
// Pool-starvation rule: every request path stays ≤3 concurrent DB queries. This
// service runs 3 sequential waves (peak 3 concurrent) and merges in JS — no
// multi-CTE `db.execute(sql\`…\`)`. The "hot topic" is the circle with the most
// activity (posts + comments + accepted-solutions) in the window; each signal is
// a separate single-table/groupBy builder query merged in JS, which is what
// keeps us off a fragile multi-CTE raw query. PostHog remains the product-
// analytics surface; this aggregation is from our own DB so the digest still
// works when PostHog is unreachable.

import { eq, and, gte, lt, desc, count, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import type { DrizzleClient } from '@pm-operator/db';
import type { WeeklyDigestData } from '../email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';
const TOP_CONTRIBUTORS = 3;

/**
 * Compute the weekly digest for the window [weekStart, now). Defaults to a
 * rolling 7-day window ending now, so the on-demand /digest page and the Monday
 * cron summarize the same trailing week regardless of exact cron timing.
 * A quiet week returns zeros (not null); callers `.catch(() => null)` to degrade
 * to a hidden banner / a skipped send on a hard error.
 */
export async function getWeeklyDigest(
  db: DrizzleClient,
  weekStart: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
): Promise<WeeklyDigestData> {
  const weekEnd = new Date();

  // Wave 1 (2 concurrent): totals.
  const [postsTotal, solutionsTotal] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.status, 'published'),
          gte(schema.posts.createdAt, weekStart),
          lt(schema.posts.createdAt, weekEnd),
        ),
      )
      .limit(1),
    db
      .select({ value: count() })
      .from(schema.pointEvents)
      .where(
        and(
          eq(schema.pointEvents.eventType, 'solution_accepted'),
          gte(schema.pointEvents.awardedAt, weekStart),
          lt(schema.pointEvents.awardedAt, weekEnd),
        ),
      )
      .limit(1),
  ]);

  // Wave 2 (3 concurrent): per-group activity signals, merged in JS.
  const [postsByGroup, commentsByGroup, solutionsByGroup] = await Promise.all([
    db
      .select({ groupId: schema.posts.groupId, value: count() })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.status, 'published'),
          gte(schema.posts.createdAt, weekStart),
          lt(schema.posts.createdAt, weekEnd),
        ),
      )
      .groupBy(schema.posts.groupId),
    db
      .select({ groupId: schema.posts.groupId, value: count() })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
      .where(
        and(
          eq(schema.comments.status, 'published'),
          gte(schema.comments.createdAt, weekStart),
          lt(schema.comments.createdAt, weekEnd),
        ),
      )
      .groupBy(schema.posts.groupId),
    db
      .select({ groupId: schema.pointEvents.groupId, value: count() })
      .from(schema.pointEvents)
      .where(
        and(
          eq(schema.pointEvents.eventType, 'solution_accepted'),
          gte(schema.pointEvents.awardedAt, weekStart),
          lt(schema.pointEvents.awardedAt, weekEnd),
          sql`${schema.pointEvents.groupId} IS NOT NULL`,
        ),
      )
      .groupBy(schema.pointEvents.groupId),
  ]);

  const activity = new Map<string, number>();
  for (const { groupId, value } of [...postsByGroup, ...commentsByGroup, ...solutionsByGroup]) {
    if (!groupId) continue;
    activity.set(groupId, (activity.get(groupId) ?? 0) + Number(value));
  }
  const topGroupId = [...activity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Wave 3 (2 concurrent): the hot topic group + the top contributors (a single
  // point_events⋈users groupBy returns names inline, so no follow-up fetch).
  const [hotTopic, topContributorRows] = await Promise.all([
    topGroupId
      ? db.query.groups.findFirst({
          where: eq(schema.groups.id, topGroupId),
          columns: { name: true, slug: true },
        })
      : Promise.resolve(null),
    db
      .select({
        userId: schema.pointEvents.userId,
        username: schema.users.username,
        fullName: schema.users.fullName,
        value: count(),
      })
      .from(schema.pointEvents)
      .innerJoin(schema.users, eq(schema.pointEvents.userId, schema.users.id))
      .where(
        and(
          gte(schema.pointEvents.awardedAt, weekStart),
          lt(schema.pointEvents.awardedAt, weekEnd),
        ),
      )
      .groupBy(schema.pointEvents.userId, schema.users.username, schema.users.fullName)
      .orderBy(desc(count()))
      .limit(TOP_CONTRIBUTORS),
  ]);

  const topContributors = topContributorRows
    .map((r) => r.fullName || r.username)
    .filter(Boolean)
    .join(', ');

  return {
    posts: Number(postsTotal[0]?.value ?? 0),
    solutionsAccepted: Number(solutionsTotal[0]?.value ?? 0),
    hotTopicName: hotTopic?.name ?? '',
    hotTopicUrl: hotTopic ? `${SITE_URL}/g/${hotTopic.slug}` : '',
    topContributors,
  };
}