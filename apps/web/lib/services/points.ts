import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { PointEventType, DailyStatType, PointEvent } from '@pm-operator/api';
import { POINT_WEIGHTS, DAILY_CAPS } from '@pm-operator/api';
import { toISO, toNumber } from './shared';

export async function awardPoints(
  db: DrizzleClient,
  input: {
    userId: string;
    eventType: PointEventType;
    points: number;
    sourceId?: string | null;
    groupId?: string | null;
    context?: Record<string, unknown>;
  }
): Promise<PointEvent | null> {
  // Idempotency: skip duplicate source events (enforced by unique index).
  if (input.sourceId) {
    const existing = await db.query.pointEvents.findFirst({
      where: and(
        eq(schema.pointEvents.userId, input.userId),
        eq(schema.pointEvents.eventType, input.eventType),
        eq(schema.pointEvents.sourceId, input.sourceId)
      ),
    });
    if (existing) return null;
  }

  try {
    const [event] = await db
      .insert(schema.pointEvents)
      .values({
        userId: input.userId,
        eventType: input.eventType,
        points: input.points.toString(),
        sourceId: input.sourceId ?? null,
        groupId: input.groupId ?? null,
        context: input.context ?? {},
      })
      .returning();

    if (!event) throw new Error('Failed to award points');

    return {
      id: event.id,
      userId: event.userId,
      eventType: event.eventType as PointEventType,
      points: toNumber(event.points),
      sourceId: event.sourceId,
      groupId: event.groupId,
      context: (event.context ?? {}) as Record<string, unknown>,
      awardedAt: toISO(event.awardedAt),
      createdAt: toISO(event.createdAt),
    };
  } catch (err: any) {
    if (err.message?.includes('unique constraint')) {
      return null;
    }
    throw err;
  }
}

/**
 * One-time +5 for writing a ≥50-char bio (SEO plan Phase 3). awardPoints'
 * built-in idempotency check only fires with a sourceId and the bio award has
 * none, so this does its own existence check first; the
 * point_events_profile_bio_idx partial unique index (migration 0027) is the
 * race guard when two saves land concurrently.
 */
export async function awardProfileBio(
  db: DrizzleClient,
  userId: string
): Promise<PointEvent | null> {
  const existing = await db.query.pointEvents.findFirst({
    where: and(
      eq(schema.pointEvents.userId, userId),
      eq(schema.pointEvents.eventType, 'profile_bio')
    ),
  });
  if (existing) return null;

  return awardPoints(db, {
    userId,
    eventType: 'profile_bio',
    points: POINT_WEIGHTS.profile_bio,
  });
}

export async function trackDailyStat(
  db: DrizzleClient,
  userId: string,
  statType: DailyStatType,
  opts: {
    countCap: number;
    pointsCap: number;
    pointsPerAction: number;
  },
  sourceId?: string
): Promise<{ awarded: boolean; pointsEarned: number }> {
  const { countCap, pointsCap, pointsPerAction } = opts;
  const today = new Date().toISOString().split('T')[0];

  const rows = (await db.execute(sql`
    WITH old AS (
      SELECT count, points_earned
      FROM user_daily_stats
      WHERE user_id = ${userId}
        AND date = ${today}
        AND stat_type = ${statType}
    ),
    upsert AS (
      INSERT INTO user_daily_stats (user_id, date, stat_type, count, points_earned)
      VALUES (
        ${userId},
        ${today},
        ${statType},
        1,
        LEAST(${pointsPerAction}::numeric, ${pointsCap}::numeric)
      )
      ON CONFLICT (user_id, date, stat_type)
      DO UPDATE SET
        count = CASE
          WHEN user_daily_stats.count < ${countCap} THEN user_daily_stats.count + 1
          ELSE user_daily_stats.count
        END,
        points_earned = LEAST(
          user_daily_stats.points_earned + ${pointsPerAction}::numeric,
          ${pointsCap}::numeric
        ),
        updated_at = now()
      WHERE user_daily_stats.count < ${countCap}
         OR user_daily_stats.points_earned < ${pointsCap}::numeric
      RETURNING count, points_earned
    )
    SELECT
      u.count,
      u.points_earned,
      COALESCE(o.count, 0) AS old_count,
      COALESCE(o.points_earned, 0) AS old_points_earned
    FROM upsert u
    LEFT JOIN old o ON true
  `)) as unknown as Array<{
    count: number | string;
    points_earned: number | string;
    old_count: number | string;
    old_points_earned: number | string;
  }>;
  const row = rows[0];

  if (!row) return { awarded: false, pointsEarned: 0 };

  const newPoints = toNumber(row.points_earned);
  const oldPoints = toNumber(row.old_points_earned);
  const actualPoints = Math.max(0, newPoints - oldPoints);

  if (actualPoints <= 0) {
    return { awarded: false, pointsEarned: 0 };
  }

  const pointEventType: PointEventType =
    statType === 'posts_read' ? 'posts_read' : 'like_given';

  await awardPoints(db, {
    userId,
    eventType: pointEventType,
    points: actualPoints,
    sourceId,
    context: { statType, date: today },
  });

  return { awarded: true, pointsEarned: actualPoints };
}

export async function awardDailyVisit(
  db: DrizzleClient,
  userId: string
): Promise<PointEvent | null> {
  return awardPoints(db, {
    userId,
    eventType: 'daily_visit',
    points: POINT_WEIGHTS.daily_visit,
    context: { date: new Date().toISOString().split('T')[0] },
  });
}

/**
 * Advance the user's activity streak for the current UTC day (SPEC_LOG
 * 2026-08-01, D2/D3). Called after post/comment creation. One atomic UPDATE:
 * same day → no change; consecutive day → +1; gap → reset to 1. Awards the
 * streak_bonus point event (+2) while the streak is within the 30-day cap.
 * Never throws — streak bookkeeping must not fail the caller's main operation.
 */
export async function advanceStreak(
  db: DrizzleClient,
  userId: string
): Promise<{ current: number; longest: number; advanced: boolean; bonusAwarded: boolean }> {
  try {
    // "prev" is a self-join on the same row: RETURNING sees post-update
    // values on "users", so the old streak_last_date must come from prev.
    const rows = (await db.execute(sql`
      UPDATE users
      SET
        streak_days = CASE
          WHEN prev.streak_last_date = (now() AT TIME ZONE 'UTC')::date THEN prev.streak_days
          WHEN prev.streak_last_date = (now() AT TIME ZONE 'UTC')::date - 1 THEN prev.streak_days + 1
          ELSE 1
        END,
        longest_streak_days = GREATEST(
          prev.longest_streak_days,
          CASE
            WHEN prev.streak_last_date = (now() AT TIME ZONE 'UTC')::date THEN prev.streak_days
            WHEN prev.streak_last_date = (now() AT TIME ZONE 'UTC')::date - 1 THEN prev.streak_days + 1
            ELSE 1
          END
        ),
        streak_last_date = (now() AT TIME ZONE 'UTC')::date
      FROM users AS prev
      WHERE users.id = ${userId} AND prev.id = users.id
      RETURNING
        users.streak_days,
        users.longest_streak_days,
        (prev.streak_last_date IS DISTINCT FROM (now() AT TIME ZONE 'UTC')::date) AS advanced
    `)) as unknown as Array<{
      streak_days: number | string;
      longest_streak_days: number | string;
      advanced: boolean;
    }>;
    const row = rows[0];
    if (!row) return { current: 0, longest: 0, advanced: false, bonusAwarded: false };

    const current = toNumber(row.streak_days);
    const longest = toNumber(row.longest_streak_days);
    const advanced = Boolean(row.advanced);

    let bonusAwarded = false;
    if (advanced && current <= DAILY_CAPS.streakBonusMaxDays) {
      const event = await awardPoints(db, {
        userId,
        eventType: 'streak_bonus',
        points: POINT_WEIGHTS.streak_bonus,
        context: { streakDays: current },
      });
      bonusAwarded = event !== null;
    }

    return { current, longest, advanced, bonusAwarded };
  } catch (err) {
    console.error('advanceStreak failed', err);
    return { current: 0, longest: 0, advanced: false, bonusAwarded: false };
  }
}

export async function awardPostRead(
  db: DrizzleClient,
  userId: string,
  postId: string
): Promise<{ awarded: boolean; pointsEarned: number }> {
  return trackDailyStat(
    db,
    userId,
    'posts_read',
    {
      countCap: DAILY_CAPS.postsReadCount,
      pointsCap: DAILY_CAPS.postsReadPoints,
      pointsPerAction: POINT_WEIGHTS.posts_read,
    },
    postId
  );
}
