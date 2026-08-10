// Weekly community digest aggregation (T8.3, enriched by redesign track 2D).
// Computes the summary shown in the /feed banner, the /digest page, and the
// Monday weekly-digest email.
//
// Pool-starvation rule: every request path stays ≤3 concurrent DB queries.
// This service runs 3 sequential waves (peak 3 concurrent) and merges in JS:
//   Wave 1 (1 query):  the scoping circles — the viewer's circles when a
//                      viewerId is given, otherwise every circle (community-
//                      wide, which preserves the pre-2D behavior for the
//                      /digest page and the Monday cron, both viewerless).
//   Wave 2 (3 queries): (a) the stats trio — posts, accepted solutions, and
//                      new members this week — as ONE UNION ALL statement,
//                      (b) top posts (limit 3), (c) new builds (limit 3).
//   Wave 3 (3 queries): (a) still-unanswered questions (limit 3), (b) the hot
//                      topic — the same three activity signals as before
//                      (posts + comments + accepted solutions per circle)
//                      merged into ONE UNION ALL statement and summed in JS,
//                      (c) top contributors (kept from the original payload).
// Every query is scoped to the wave-1 circle ids (group_id = ANY($circleIds),
// expressed as drizzle's parameterized `inArray` — same semantics, no raw
// array-param encoding). Circle names come from wave 1, so no follow-up
// group lookups are needed.
//
// Section items are shaped {id, title, authorName, circleName, stat, upvotes,
// solved, createdAt} — `stat` is posts.comment_count, `upvotes` the ▲ number
// the /digest page shows for top posts/builds (see
// packages/api/src/contracts/digest.ts).
// PostHog remains the product-analytics surface; this aggregation is from our
// own DB so the digest still works when PostHog is unreachable.

import {
  eq,
  and,
  gte,
  lt,
  desc,
  count,
  countDistinct,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import * as schema from '@pm-operator/db';
import type { DrizzleClient } from '@pm-operator/db';
import type { WeeklyDigest, DigestSectionItem } from '@pm-operator/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';
const TOP_CONTRIBUTORS = 3;
const SECTION_LIMIT = 3;

interface SectionRow {
  id: string;
  title: string;
  fullName: string | null;
  username: string | null;
  groupId: string;
  stat: number;
  upvotes: number;
  acceptedCommentId: string | null;
  createdAt: Date;
}

function emptyDigest(): WeeklyDigest {
  return {
    posts: 0,
    solutionsAccepted: 0,
    hotTopicName: '',
    hotTopicUrl: '',
    topContributors: '',
    newMembers: 0,
    topPosts: [],
    newBuilds: [],
    unansweredQuestions: [],
  };
}

/**
 * Compute the weekly digest for the window [weekStart, now). Defaults to a
 * rolling 7-day window ending now, so the on-demand /digest page and the Monday
 * cron summarize the same trailing week regardless of exact cron timing.
 *
 * `viewerId` (additive, track 2D) scopes the digest to the circles the viewer
 * belongs to; when omitted the digest covers all circles, matching the
 * pre-2D community-wide output for the existing viewerless callers.
 *
 * A quiet week returns zeros and empty sections (not null); callers
 * `.catch(() => null)` to degrade to a hidden banner / a skipped send on a
 * hard error.
 */
export async function getWeeklyDigest(
  db: DrizzleClient,
  weekStart: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  viewerId?: string,
): Promise<WeeklyDigest> {
  const weekEnd = new Date();

  // Wave 1 (1 query): the scoping circles, with names/slugs so later waves
  // never need a groups lookup.
  const circleColumns = {
    id: schema.groups.id,
    name: schema.groups.name,
    slug: schema.groups.slug,
  };
  const circles = viewerId
    ? await db
        .select(circleColumns)
        .from(schema.groups)
        .innerJoin(
          schema.groupMemberships,
          eq(schema.groupMemberships.groupId, schema.groups.id),
        )
        .where(eq(schema.groupMemberships.userId, viewerId))
    : await db.select(circleColumns).from(schema.groups);

  if (circles.length === 0) return emptyDigest();

  const circleIds = circles.map((c) => c.id);
  const circleById = new Map(circles.map((c) => [c.id, c]));

  const postsThisWeek = and(
    eq(schema.posts.status, 'published'),
    gte(schema.posts.createdAt, weekStart),
    lt(schema.posts.createdAt, weekEnd),
    inArray(schema.posts.groupId, circleIds),
  );
  const solutionsThisWeek = and(
    eq(schema.pointEvents.eventType, 'solution_accepted'),
    gte(schema.pointEvents.awardedAt, weekStart),
    lt(schema.pointEvents.awardedAt, weekEnd),
    inArray(schema.pointEvents.groupId, circleIds),
  );

  const sectionColumns = {
    id: schema.posts.id,
    title: schema.posts.title,
    fullName: schema.users.fullName,
    username: schema.users.username,
    groupId: schema.posts.groupId,
    stat: schema.posts.commentCount,
    upvotes: schema.posts.upvotes,
    acceptedCommentId: schema.posts.acceptedCommentId,
    createdAt: schema.posts.createdAt,
  };
  const toItem = (row: SectionRow): DigestSectionItem => ({
    id: row.id,
    title: row.title,
    authorName: row.fullName || row.username || '',
    circleName: circleById.get(row.groupId)?.name ?? '',
    stat: Number(row.stat),
    upvotes: Number(row.upvotes),
    solved: row.acceptedCommentId !== null,
    createdAt: row.createdAt.toISOString(),
  });

  // Wave 2 (3 concurrent): (a) the stats trio as ONE statement, (b) top
  // posts, (c) new builds.
  const [statRows, topPostRows, newBuildRows] = await Promise.all([
    unionAll(
      db
        .select({ metric: sql<string>`'posts'`, value: count() })
        .from(schema.posts)
        .where(postsThisWeek),
      db
        .select({ metric: sql<string>`'solutions'`, value: count() })
        .from(schema.pointEvents)
        .where(solutionsThisWeek),
      db
        .select({
          metric: sql<string>`'new_members'`,
          value: countDistinct(schema.groupMemberships.userId),
        })
        .from(schema.groupMemberships)
        .where(
          and(
            gte(schema.groupMemberships.joinedAt, weekStart),
            lt(schema.groupMemberships.joinedAt, weekEnd),
            inArray(schema.groupMemberships.groupId, circleIds),
          ),
        ),
    ),
    db
      .select(sectionColumns)
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(postsThisWeek)
      .orderBy(
        desc(schema.posts.commentCount),
        desc(schema.posts.upvotes),
        desc(schema.posts.createdAt),
      )
      .limit(SECTION_LIMIT),
    db
      .select(sectionColumns)
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(and(postsThisWeek, eq(schema.posts.type, 'build')))
      .orderBy(desc(schema.posts.createdAt))
      .limit(SECTION_LIMIT),
  ]);

  const statOf = (metric: string) =>
    Number(statRows.find((r) => r.metric === metric)?.value ?? 0);

  // Wave 3 (3 concurrent): (a) still-unanswered questions, (b) the hot topic —
  // the pre-2D activity signals (posts + comments + accepted solutions per
  // circle) as ONE UNION ALL statement summed in JS, (c) top contributors (a
  // single point_events⋈users groupBy returns names inline, no follow-up).
  const [unansweredRows, activityRows, topContributorRows] = await Promise.all([
    db
      .select(sectionColumns)
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(
        and(
          postsThisWeek,
          eq(schema.posts.type, 'question'),
          isNull(schema.posts.acceptedCommentId),
        ),
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(SECTION_LIMIT),
    unionAll(
      db
        .select({
          groupId: sql<string | null>`${schema.posts.groupId}`,
          value: count(),
        })
        .from(schema.posts)
        .where(postsThisWeek)
        .groupBy(schema.posts.groupId),
      db
        .select({
          groupId: sql<string | null>`${schema.posts.groupId}`,
          value: count(),
        })
        .from(schema.comments)
        .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
        .where(
          and(
            eq(schema.comments.status, 'published'),
            gte(schema.comments.createdAt, weekStart),
            lt(schema.comments.createdAt, weekEnd),
            inArray(schema.posts.groupId, circleIds),
          ),
        )
        .groupBy(schema.posts.groupId),
      db
        .select({
          groupId: sql<string | null>`${schema.pointEvents.groupId}`,
          value: count(),
        })
        .from(schema.pointEvents)
        .where(solutionsThisWeek)
        .groupBy(schema.pointEvents.groupId),
    ),
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
          inArray(schema.pointEvents.groupId, circleIds),
        ),
      )
      .groupBy(schema.pointEvents.userId, schema.users.username, schema.users.fullName)
      .orderBy(desc(count()))
      .limit(TOP_CONTRIBUTORS),
  ]);

  const activity = new Map<string, number>();
  for (const { groupId, value } of activityRows) {
    if (!groupId) continue;
    activity.set(groupId, (activity.get(groupId) ?? 0) + Number(value));
  }
  const topGroupId = [...activity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const hotTopic = topGroupId ? circleById.get(topGroupId) : undefined;

  const topContributors = topContributorRows
    .map((r) => r.fullName || r.username)
    .filter(Boolean)
    .join(', ');

  return {
    posts: statOf('posts'),
    solutionsAccepted: statOf('solutions'),
    hotTopicName: hotTopic?.name ?? '',
    hotTopicUrl: hotTopic ? `${SITE_URL}/g/${hotTopic.slug}` : '',
    topContributors,
    newMembers: statOf('new_members'),
    topPosts: topPostRows.map(toItem),
    newBuilds: newBuildRows.map(toItem),
    unansweredQuestions: unansweredRows.map(toItem),
  };
}
