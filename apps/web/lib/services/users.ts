import { eq, ne, and, sql, count, desc } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  PatchMeRequest,
  UserPublicProfile,
  UserProfileDetail,
  CircleContribution,
  MyStreakResponse,
  OnboardingRequest,
} from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { awardProfileBio } from './points';
import { toUserPublicProfile, toPublicUserProfile, toISO, toNumber } from './shared';

export async function getUserProfile(
  db: DrizzleClient,
  slug: string
): Promise<UserProfileDetail | null> {
  // User row first: the counts key off user.id so a mixed-case slug can never
  // diverge from the lower() lookup (the old userslug join was case-sensitive
  // and returned acceptedSolutions 0 for mixed-case slugs).
  const user = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
  });
  if (!user) return null;

  const [acceptedSolutions, postsCount] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
      .where(eq(schema.comments.authorId, user.id))
      .then((rows) => Number(rows[0]?.value ?? 0)),
    db
      .select({ value: count() })
      .from(schema.posts)
      .where(and(eq(schema.posts.authorId, user.id), eq(schema.posts.status, 'published')))
      .then((rows) => Number(rows[0]?.value ?? 0)),
  ]);

  const base = await toPublicUserProfile({ ...user, acceptedSolutions });
  return {
    ...base,
    aboutMe: user.aboutMe,
    headline: user.headline,
    linkedinUrl: user.linkedinUrl,
    githubUrl: user.githubUrl,
    postsCount,
    joinedAt: toISO(user.createdAt),
    levelInfo: levelForScore(toNumber(user.reputationScore)),
    followerCount: user.followerCount,
    followingCount: user.followingCount,
  };
}

// Profile sidebar circles (WS6/T6.3): the user's all-time score per circle
// plus solutions accepted in that circle. Direct lookup on user_scores —
// (userId, groupId, period, periodStart) is the PK, so 'all_time' yields one
// row per circle.
export async function listUserCircleContributions(
  db: DrizzleClient,
  userId: string,
  limit = 5
): Promise<CircleContribution[]> {
  const [scoreRows, solutionRows] = await Promise.all([
    db
      .select({
        slug: schema.groups.slug,
        name: schema.groups.name,
        color: schema.groups.color,
        groupId: schema.userScores.groupId,
        score: schema.userScores.score,
      })
      .from(schema.userScores)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.userScores.groupId))
      .where(
        and(
          eq(schema.userScores.userId, userId),
          ne(schema.userScores.groupId, schema.GLOBAL_GROUP_ID),
          eq(schema.userScores.period, 'all_time')
        )
      )
      .orderBy(desc(schema.userScores.score))
      .limit(limit),
    db
      .select({
        groupId: schema.posts.groupId,
        count: count(),
      })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
      .where(eq(schema.comments.authorId, userId))
      .groupBy(schema.posts.groupId),
  ]);

  const solutionsByGroup = new Map(solutionRows.map((r) => [r.groupId, Number(r.count)]));

  return scoreRows.map((r) => ({
    group: { slug: r.slug, name: r.name, color: r.color },
    score: toNumber(r.score),
    acceptedSolutions: solutionsByGroup.get(r.groupId) ?? 0,
  }));
}

// Where a member actually earns reputation, straight off the ledger (track 5C).
export interface CirclePointsSlice {
  group: { slug: string; name: string; color: string | null };
  points: number;
  /** Whole-percent share of the member's circle-attributed points (0–100). */
  share: number;
}

// ONE query, deliberately. point_events is the source of truth for the points
// economy, so grouping it by group_id answers "where does this member earn?"
// without a second round trip: the window function carries the all-circles
// total on every row, so `share` needs no follow-up aggregate. The profile page
// slots this into an existing 2-wide wave (pool = 3, and the community layout
// rail already spends one query on every navigation).
//
// Deliberately NOT user_scores: that table is the *ranking* projection (see
// listUserCircleContributions), whereas the ledger explains the score event by
// event. Rows with a null group_id (global awards such as daily_visit) drop out
// on the inner join, which is the point — this breakdown only covers
// circle-attributed reputation.
export async function listUserCirclePoints(
  db: DrizzleClient,
  userId: string,
  limit = 5
): Promise<CirclePointsSlice[]> {
  const pointsSum = sql<string>`sum(${schema.pointEvents.points})`;

  const rows = await db
    .select({
      slug: schema.groups.slug,
      name: schema.groups.name,
      color: schema.groups.color,
      points: pointsSum,
      total: sql<string>`sum(sum(${schema.pointEvents.points})) over ()`,
    })
    .from(schema.pointEvents)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.pointEvents.groupId))
    .where(
      and(
        eq(schema.pointEvents.userId, userId),
        ne(schema.pointEvents.groupId, schema.GLOBAL_GROUP_ID)
      )
    )
    .groupBy(schema.groups.id, schema.groups.slug, schema.groups.name, schema.groups.color)
    .orderBy(desc(pointsSum))
    .limit(limit);

  const total = toNumber(rows[0]?.total);

  return rows.map((row) => {
    const points = toNumber(row.points);
    return {
      group: { slug: row.slug, name: row.name, color: row.color },
      points,
      share: total > 0 ? Math.round((points / total) * 100) : 0,
    };
  });
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Mon–Sun streak week (T2.3, shared by GET /api/v1/me/streak and the profile
// page). All day math happens in SQL against UTC so the DB clock is the single
// source of truth (same convention as advanceStreak / the daily indexes).
// Week activity derives from public point events (posts/comments), so it is
// safe to render on public profiles.
export async function getUserStreakWeek(
  db: DrizzleClient,
  userId: string
): Promise<MyStreakResponse | null> {
  const rows = (await db.execute(sql`
    SELECT
      u.streak_days,
      u.longest_streak_days,
      to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today,
      to_char(date_trunc('week', (now() AT TIME ZONE 'UTC'))::date, 'YYYY-MM-DD') AS week_start,
      COALESCE(
        (
          SELECT array_agg(DISTINCT to_char(CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date), 'YYYY-MM-DD'))
          FROM point_events pe
          WHERE pe.user_id = u.id
            AND pe.event_type IN ('topic_created', 'comment_created')
            AND CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date)
                >= date_trunc('week', (now() AT TIME ZONE 'UTC'))::date
            AND CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date)
                < date_trunc('week', (now() AT TIME ZONE 'UTC'))::date + 7
        ),
        '{}'
      ) AS active_days
    FROM users u
    WHERE u.id = ${userId}
  `)) as unknown as Array<{
    streak_days: number | string;
    longest_streak_days: number | string;
    today: string;
    week_start: string;
    active_days: string[];
  }>;
  const row = rows[0];
  if (!row) return null;

  const activeDays = new Set(row.active_days ?? []);
  const weekStart = new Date(`${row.week_start}T00:00:00Z`);

  const days: MyStreakResponse['days'] = DAY_LABELS.map((label, i) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    const state = activeDays.has(date) ? 'done' : date === row.today ? 'pending' : 'empty';
    return { date, label, state };
  });

  return {
    current: toNumber(row.streak_days),
    best: toNumber(row.longest_streak_days),
    days,
  };
}

export interface DevCardSummary {
  userslug: string;
  displayName: string;
  level: number;
  reputationScore: number;
  postsCount: number;
  acceptedSolutions: number;
  streakDays: number;
  joinedAt: string;
}

// T5G: the DevCard PNG (GET /api/og/devcard/[slug]) renders inside satori and
// must stay cheap — this is a hard 2-query budget, run SEQUENTIALLY so the OG
// route never adds concurrency to the small pool (see "Pool-starvation gotcha").
// Query 1 is the user row (level, streak and join date all live there); query 2
// folds both counts into one round trip via scalar subqueries. Everything it
// returns is a primitive, because Drizzle cannot run inside the ImageResponse
// tree. Deliberately NOT getUserProfile — that one costs 3 queries and signs
// avatar URLs the PNG does not use.
export async function getDevCardSummary(
  db: DrizzleClient,
  slug: string
): Promise<DevCardSummary | null> {
  const user = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
    columns: {
      id: true,
      username: true,
      fullName: true,
      userslug: true,
      reputationScore: true,
      streakDays: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const countRows = (await db.execute(sql`
    SELECT
      (
        SELECT count(*) FROM posts p
        WHERE p.author_id = ${user.id} AND p.status = 'published'
      ) AS posts_count,
      (
        SELECT count(*) FROM comments c
        JOIN posts p ON p.accepted_comment_id = c.id
        WHERE c.author_id = ${user.id}
      ) AS accepted_solutions
  `)) as unknown as Array<{ posts_count: number | string; accepted_solutions: number | string }>;
  const counts = countRows[0];

  return {
    userslug: user.userslug,
    displayName: user.fullName || user.username,
    level: levelForScore(toNumber(user.reputationScore)).level,
    reputationScore: toNumber(user.reputationScore),
    postsCount: toNumber(counts?.posts_count),
    acceptedSolutions: toNumber(counts?.accepted_solutions),
    streakDays: toNumber(user.streakDays),
    joinedAt: toISO(user.createdAt),
  };
}

export async function updateUserProfile(
  db: DrizzleClient,
  userId: string,
  input: PatchMeRequest
): Promise<UserPublicProfile> {
  const { fullName, aboutMe, pictureUrl, linkedinUrl, githubUrl, headline, preferences } = input;

  const update: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (fullName !== undefined) update.fullName = fullName;
  if (aboutMe !== undefined) update.aboutMe = aboutMe;
  // pictureUrl is stored as a relative storage path from the client upload.
  if (pictureUrl !== undefined) update.pictureUrl = pictureUrl;
  if (linkedinUrl !== undefined) update.linkedinUrl = linkedinUrl;
  if (githubUrl !== undefined) update.githubUrl = githubUrl;
  if (headline !== undefined) update.headline = headline;
  if (preferences !== undefined) {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { preferences: true },
    });
    update.preferences = {
      ...(existing?.preferences ?? {}),
      ...preferences,
    };
  }

  const [updated] = await db
    .update(schema.users)
    .set(update)
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) throw new Error('User not found');

  // One-time +5 bio bonus (SEO plan Phase 3): fires on every save whose bio
  // clears 50 trimmed chars; awardProfileBio is idempotent via the partial
  // unique index, and a failed award must never fail the profile save.
  if (updated.aboutMe && updated.aboutMe.trim().length >= 50) {
    try {
      await awardProfileBio(db, userId);
    } catch (err) {
      console.error('[points] profile_bio award failed', err);
    }
  }

  return toUserPublicProfile(updated);
}

export async function completeOnboarding(
  db: DrizzleClient,
  userId: string,
  input: OnboardingRequest
): Promise<UserPublicProfile> {
  const [updated] = await db
    .update(schema.users)
    .set({
      painfulToolStackTask: input.painfulToolStackTask,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) throw new Error('User not found');

  return toUserPublicProfile(updated);
}
