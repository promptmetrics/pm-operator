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

export async function updateUserProfile(
  db: DrizzleClient,
  userId: string,
  input: PatchMeRequest
): Promise<UserPublicProfile> {
  const { fullName, aboutMe, pictureUrl, preferences } = input;

  const update: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (fullName !== undefined) update.fullName = fullName;
  if (aboutMe !== undefined) update.aboutMe = aboutMe;
  // pictureUrl is stored as a relative storage path from the client upload.
  if (pictureUrl !== undefined) update.pictureUrl = pictureUrl;
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
