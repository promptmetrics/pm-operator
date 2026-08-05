import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { toNumber } from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  totalMembers: number;
  activeMembers7d: number;
  pendingFlags: number;
  newMembers30d: number;
  totalCircles: number;
  totalPosts: number;
  totalComments: number;
}

export interface MemberGrowthPoint {
  date: string;
  count: number;
}

export interface TopCircle {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  postCount: number;
  commentCount: number;
  memberCount: number;
  engagementScore: number;
}

export interface EngagementMetrics {
  topCircles: TopCircle[];
  topPosts: {
    id: string;
    title: string;
    groupSlug: string;
    upvotes: number;
    commentCount: number;
    viewCount: number;
  }[];
  topMembers: {
    id: string;
    username: string;
    userslug: string;
    reputationScore: number;
    streakDays: number;
  }[];
}

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(
  db: DrizzleClient
): Promise<AnalyticsOverview> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalMembersResult,
    activeMembersResult,
    pendingFlagsResult,
    newMembersResult,
    totalCirclesResult,
    totalPostsResult,
    totalCommentsResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(schema.users),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          gte(schema.users.lastActiveAt, sevenDaysAgo),
          sql`${schema.users.lastActiveAt} IS NOT NULL`
        )
      ),
    db
      .select({ count: count() })
      .from(schema.flags)
      .where(eq(schema.flags.status, 'open')),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(gte(schema.users.createdAt, thirtyDaysAgo)),
    db.select({ count: count() }).from(schema.groups),
    db
      .select({ count: count() })
      .from(schema.posts)
      .where(eq(schema.posts.status, 'published')),
    db
      .select({ count: count() })
      .from(schema.comments)
      .where(eq(schema.comments.status, 'published')),
  ]);

  return {
    totalMembers: totalMembersResult[0]?.count ?? 0,
    activeMembers7d: activeMembersResult[0]?.count ?? 0,
    pendingFlags: pendingFlagsResult[0]?.count ?? 0,
    newMembers30d: newMembersResult[0]?.count ?? 0,
    totalCircles: totalCirclesResult[0]?.count ?? 0,
    totalPosts: totalPostsResult[0]?.count ?? 0,
    totalComments: totalCommentsResult[0]?.count ?? 0,
  };
}

// ── Member Growth ────────────────────────────────────────────────────────────

export async function getMemberGrowth(
  db: DrizzleClient,
  days: number
): Promise<MemberGrowthPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(${schema.users.createdAt})`,
      count: count(),
    })
    .from(schema.users)
    .where(gte(schema.users.createdAt, startDate))
    .groupBy(sql`DATE(${schema.users.createdAt})`)
    .orderBy(sql`DATE(${schema.users.createdAt})`);

  return rows.map((r) => ({
    date: r.date,
    count: r.count,
  }));
}

// ── Engagement Metrics ───────────────────────────────────────────────────────

export async function getEngagementMetrics(
  db: DrizzleClient
): Promise<EngagementMetrics> {
  // Top circles by activity
  const topCirclesRaw = await db
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      slug: schema.groups.slug,
      color: schema.groups.color,
      memberCount: schema.groups.memberCount,
      postCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${schema.posts}
        WHERE ${schema.posts.groupId} = ${schema.groups.id}
        AND ${schema.posts.status} = 'published'
      ), 0)`,
      commentCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${schema.comments}
        JOIN ${schema.posts} ON ${schema.posts.id} = ${schema.comments.postId}
        WHERE ${schema.posts.groupId} = ${schema.groups.id}
        AND ${schema.comments.status} = 'published'
      ), 0)`,
    })
    .from(schema.groups)
    .orderBy(desc(schema.groups.memberCount))
    .limit(10);

  const topCircles: TopCircle[] = topCirclesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    postCount: c.postCount,
    commentCount: c.commentCount,
    memberCount: c.memberCount,
    engagementScore: 5 * c.postCount + 2 * c.commentCount + 1 * c.memberCount,
  }));

  // Top posts by upvotes
  const topPostsRaw = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      groupSlug: schema.groups.slug,
      upvotes: schema.posts.upvotes,
      commentCount: schema.posts.commentCount,
      viewCount: schema.posts.viewCount,
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.upvotes))
    .limit(10);

  const topPosts = topPostsRaw.map((p) => ({
    id: p.id,
    title: p.title,
    groupSlug: p.groupSlug,
    upvotes: p.upvotes,
    commentCount: p.commentCount,
    viewCount: p.viewCount,
  }));

  // Top members by reputation
  const topMembersRaw = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      userslug: schema.users.userslug,
      reputationScore: schema.users.reputationScore,
      streakDays: schema.users.streakDays,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.reputationScore))
    .limit(10);

  const topMembers = topMembersRaw.map((m) => ({
    id: m.id,
    username: m.username,
    userslug: m.userslug,
    reputationScore: toNumber(m.reputationScore),
    streakDays: m.streakDays,
  }));

  return { topCircles, topPosts, topMembers };
}

// ── Post Growth (for sparkline) ──────────────────────────────────────────────

export async function getPostGrowth(
  db: DrizzleClient,
  days: number
): Promise<MemberGrowthPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(${schema.posts.createdAt})`,
      count: count(),
    })
    .from(schema.posts)
    .where(
      and(
        gte(schema.posts.createdAt, startDate),
        eq(schema.posts.status, 'published')
      )
    )
    .groupBy(sql`DATE(${schema.posts.createdAt})`)
    .orderBy(sql`DATE(${schema.posts.createdAt})`);

  return rows.map((r) => ({
    date: r.date,
    count: r.count,
  }));
}

// ── PostHog Integration ──────────────────────────────────────────────────────

interface PostHogInsight {
  id: number;
  name: string;
  results: unknown;
  last_refreshed: string;
}

interface CachedPostHogData {
  data: unknown;
  fetchedAt: number;
}

let posthogCache: Map<string, CachedPostHogData> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createPostHogClient() {
  const apiKey = process.env.POSTHOG_ADMIN_KEY;
  if (!apiKey) {
    return null;
  }

  const baseUrl = process.env.POSTHOG_HOST || 'https://us.posthog.com';

  async function fetchInsight(insightId: number): Promise<PostHogInsight | null> {
    const cacheKey = `insight:${insightId}`;
    const cached = posthogCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data as PostHogInsight;
    }

    try {
      const res = await fetch(
        `${baseUrl}/api/projects/@current/insights/${insightId}/`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) {
        console.warn(`PostHog insight ${insightId} fetch failed: ${res.status}`);
        return null;
      }
      const data: PostHogInsight = await res.json();
      posthogCache.set(cacheKey, { data, fetchedAt: Date.now() });
      return data;
    } catch (err) {
      console.warn('PostHog fetch error:', err);
      return null;
    }
  }

  return { fetchInsight };
}

export type PostHogClient = NonNullable<ReturnType<typeof createPostHogClient>>;
