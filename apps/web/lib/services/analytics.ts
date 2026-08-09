import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  AdminDashboard,
  AdminDashboardAttentionKind,
  AdminDashboardOnboarding,
  AdminDashboardSource,
} from '@pm-operator/api';
import { toNumber, toISO } from './shared';

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

/**
 * Community-wide counters for the admin analytics KPI cards.
 *
 * Pool max is 3 (see MEMORY: DB pool starvation trap) — three sequential waves
 * of at most 3 concurrent queries, same discipline as getAdminDashboard below.
 * This used to be a single 7-wide Promise.all, which starves the pool instead
 * of queueing. Never widen a wave or merge two of them.
 */
export async function getAnalyticsOverview(
  db: DrizzleClient
): Promise<AnalyticsOverview> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Wave 1: membership counters + the open-flag queue (3 queries).
  const [totalMembersResult, activeMembersResult, pendingFlagsResult] =
    await Promise.all([
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
    ]);

  // Wave 2: 30-day signups + content totals (3 queries).
  const [newMembersResult, totalCirclesResult, totalPostsResult] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(schema.users)
        .where(gte(schema.users.createdAt, thirtyDaysAgo)),
      db.select({ count: count() }).from(schema.groups),
      db
        .select({ count: count() })
        .from(schema.posts)
        .where(eq(schema.posts.status, 'published')),
    ]);

  // Wave 3: the remaining counter (1 query).
  const totalCommentsResult = await db
    .select({ count: count() })
    .from(schema.comments)
    .where(eq(schema.comments.status, 'published'));

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

// ── Admin Dashboard (analytics v2, redesign plan §4.5) ──────────────────────

function num(value: unknown): number {
  return toNumber(value as string | number | null | undefined);
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function rate(solved: number, total: number): number | null {
  return total === 0 ? null : solved / total;
}

/**
 * Week-over-week KPIs + feed panels for the v2 admin dashboard.
 *
 * Pool max is 3 (see MEMORY: DB pool starvation trap) — exactly two
 * sequential waves of ≤3 concurrent queries. Never widen either Promise.all
 * or merge the waves.
 */
export async function getAdminDashboard(
  db: DrizzleClient
): Promise<AdminDashboard> {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  // postgres.js cannot bind Date instances on the raw-SQL path db.execute
  // uses (drizzle only maps Dates for typed column comparisons), so the
  // window bounds are passed as ISO strings and cast server-side.
  const currentStart = sql`${new Date(now.getTime() - WEEK_MS).toISOString()}::timestamptz`;
  const priorStart = sql`${new Date(now.getTime() - 2 * WEEK_MS).toISOString()}::timestamptz`;

  // Wave 1: week-over-week aggregates (3 queries). Each statement covers both
  // windows via FILTER so the date predicate stays on created_at /
  // last_active_at and each table is scanned once.
  const [postRows, activeRows, ttfaRows] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${currentStart})::int AS posts_current,
        COUNT(*) FILTER (WHERE created_at < ${currentStart})::int AS posts_prior,
        COUNT(*) FILTER (WHERE type = 'question' AND created_at >= ${currentStart})::int AS questions_current,
        COUNT(*) FILTER (WHERE type = 'question' AND accepted_comment_id IS NOT NULL AND created_at >= ${currentStart})::int AS solved_current,
        COUNT(*) FILTER (WHERE type = 'question' AND created_at < ${currentStart})::int AS questions_prior,
        COUNT(*) FILTER (WHERE type = 'question' AND accepted_comment_id IS NOT NULL AND created_at < ${currentStart})::int AS solved_prior
      FROM posts
      WHERE status = 'published' AND created_at >= ${priorStart}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE last_active_at >= ${currentStart})::int AS active_current,
        COUNT(*) FILTER (WHERE last_active_at < ${currentStart})::int AS active_prior
      FROM users
      WHERE last_active_at >= ${priorStart}
    `),
    db.execute(sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (fc.first_comment_at - p.created_at))::double precision
        ) FILTER (WHERE p.created_at >= ${currentStart}) AS median_current,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (fc.first_comment_at - p.created_at))::double precision
        ) FILTER (WHERE p.created_at < ${currentStart}) AS median_prior
      FROM posts p
      JOIN LATERAL (
        SELECT MIN(c.created_at) AS first_comment_at
        FROM comments c
        WHERE c.post_id = p.id AND c.status = 'published'
      ) fc ON fc.first_comment_at IS NOT NULL
      WHERE p.type = 'question'
        AND p.status = 'published'
        AND p.created_at >= ${priorStart}
    `),
  ]);

  // Wave 2: dashboard panels (3 queries).
  const [perDayRows, memberRows, attentionRows] = await Promise.all([
    db.execute(sql`
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(pc.cnt, 0)::int AS count
      FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT DATE(created_at) AS day, COUNT(*)::int AS cnt
        FROM posts
        WHERE status = 'published' AND created_at >= CURRENT_DATE - 6
        GROUP BY 1
      ) pc ON pc.day = d.day::date
      ORDER BY d.day
    `),
    db.execute(sql`
      SELECT
        u.id,
        u.username,
        u.userslug,
        u.picture_url,
        u.created_at,
        CASE
          WHEN u.preferences->>'onboardingComplete' = 'true' THEN 'onboarded'
          WHEN u.painful_tool_stack_task <> '' AND u.preferences->>'onboardingStep' IS NULL THEN 'onboarded'
          ELSE 'stalled'
        END AS onboarding,
        CASE
          WHEN u.github_id IS NOT NULL THEN 'github'
          WHEN u.google_id IS NOT NULL THEN 'google'
          WHEN u.linkedin_id IS NOT NULL THEN 'linkedin'
          ELSE 'invite'
        END AS source
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 8
    `),
    db.execute(sql`
      (
        SELECT
          'open_flag' AS kind,
          f.id::text AS id,
          COALESCE(NULLIF(f.reason, ''), 'Flagged ' || f.target_type) AS title,
          f.created_at
        FROM flags f
        WHERE f.status = 'open'
        ORDER BY f.created_at ASC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'stalled_signup' AS kind,
          u.id::text AS id,
          u.username AS title,
          u.created_at
        FROM users u
        WHERE u.created_at < now() - interval '24 hours'
          AND NOT (
            COALESCE(u.preferences->>'onboardingComplete', '') = 'true'
            OR (u.painful_tool_stack_task <> '' AND u.preferences->>'onboardingStep' IS NULL)
          )
        ORDER BY u.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          'unanswered_question' AS kind,
          p.id::text AS id,
          p.title AS title,
          p.created_at
        FROM posts p
        WHERE p.type = 'question'
          AND p.status = 'published'
          AND p.created_at < now() - interval '48 hours'
          AND NOT EXISTS (
            SELECT 1 FROM comments c
            WHERE c.post_id = p.id AND c.status = 'published'
          )
        ORDER BY p.created_at ASC
        LIMIT 5
      )
    `),
  ]);

  const p = postRows[0] as Record<string, unknown> | undefined;
  const a = activeRows[0] as Record<string, unknown> | undefined;
  const m = ttfaRows[0] as Record<string, unknown> | undefined;

  return {
    weekly: {
      postsCreated: {
        current: num(p?.posts_current),
        prior: num(p?.posts_prior),
      },
      solvedRate: {
        current: rate(num(p?.solved_current), num(p?.questions_current)),
        prior: rate(num(p?.solved_prior), num(p?.questions_prior)),
      },
      activeMembers: {
        current: num(a?.active_current),
        prior: num(a?.active_prior),
      },
      medianTimeToFirstAnswerSeconds: {
        current: nullableNum(m?.median_current),
        prior: nullableNum(m?.median_prior),
      },
    },
    postsPerDay: (perDayRows as unknown as { date: string; count: number }[]).map(
      (row) => ({ date: row.date, count: num(row.count) })
    ),
    newestMembers: (
      memberRows as unknown as {
        id: string;
        username: string;
        userslug: string;
        picture_url: string | null;
        created_at: Date | string;
        onboarding: string;
        source: string;
      }[]
    ).map((row) => ({
      id: row.id,
      username: row.username,
      userslug: row.userslug,
      pictureUrl: row.picture_url,
      createdAt: toISO(row.created_at),
      onboarding: row.onboarding as AdminDashboardOnboarding,
      source: row.source as AdminDashboardSource,
    })),
    needsAttention: (
      attentionRows as unknown as {
        kind: string;
        id: string;
        title: string;
        created_at: Date | string;
      }[]
    ).map((row) => ({
      kind: row.kind as AdminDashboardAttentionKind,
      id: row.id,
      title: row.title,
      createdAt: toISO(row.created_at),
    })),
  };
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
