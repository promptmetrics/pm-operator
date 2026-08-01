import { z } from 'zod';

export const PointEventType = {
  TOPIC_CREATED: 'topic_created',
  COMMENT_CREATED: 'comment_created',
  SOLUTION_ACCEPTED: 'solution_accepted',
  LIKE_RECEIVED: 'like_received',
  LIKE_GIVEN: 'like_given',
  INVITE_ACCEPTED: 'invite_accepted',
  DAILY_VISIT: 'daily_visit',
  POSTS_READ: 'posts_read',
  // streak_bonus requires the point_event_type enum migration (WS2/T2.3)
  // before any award may be inserted.
  STREAK_BONUS: 'streak_bonus',
  MANUAL_AWARD: 'manual_award',
} as const;

export type PointEventType =
  (typeof PointEventType)[keyof typeof PointEventType];

export const pointEventTypeSchema = z.nativeEnum(
  PointEventType as Record<string, string>
) as z.ZodType<PointEventType>;

/**
 * Canonical point economy — SPEC_LOG 2026-08-01 "Community-portal redesign
 * decisions", D1 (displayed economy) and D2/D3 (streak bonus).
 * manual_award carries caller-provided points and has no fixed weight.
 */
export const POINT_WEIGHTS = {
  [PointEventType.TOPIC_CREATED]: 10,
  [PointEventType.COMMENT_CREATED]: 5,
  [PointEventType.SOLUTION_ACCEPTED]: 25,
  [PointEventType.LIKE_RECEIVED]: 2,
  [PointEventType.LIKE_GIVEN]: 1,
  [PointEventType.INVITE_ACCEPTED]: 5,
  [PointEventType.DAILY_VISIT]: 0.5,
  [PointEventType.POSTS_READ]: 0.5,
  [PointEventType.STREAK_BONUS]: 2,
} as const;

export const DAILY_CAPS = {
  likesGivenCount: 50,
  likesGivenPoints: 50,
  postsReadCount: 20,
  postsReadPoints: 10,
  streakBonusMaxDays: 30,
} as const;

export const LeaderboardPeriod = {
  ALL_TIME: 'all_time',
  QUARTERLY: 'quarterly',
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
} as const;

export type LeaderboardPeriod =
  (typeof LeaderboardPeriod)[keyof typeof LeaderboardPeriod];

export const leaderboardPeriodSchema = z.nativeEnum(
  LeaderboardPeriod as Record<string, string>
) as z.ZodType<LeaderboardPeriod>;

export const pointEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: pointEventTypeSchema,
  points: z.number(),
  sourceId: z.string().uuid().nullable(),
  groupId: z.string().uuid().nullable(),
  context: z.record(z.unknown()).default({}),
  awardedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type PointEvent = z.infer<typeof pointEventSchema>;

export const userScoreSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
  period: leaderboardPeriodSchema,
  score: z.number(),
  updatedAt: z.string().datetime(),
});

export type UserScore = z.infer<typeof userScoreSchema>;

export const DailyStatType = {
  POSTS_READ: 'posts_read',
  LIKES_GIVEN: 'likes_given',
} as const;

export type DailyStatType =
  (typeof DailyStatType)[keyof typeof DailyStatType];

export const dailyStatTypeSchema = z.nativeEnum(
  DailyStatType as Record<string, string>
) as z.ZodType<DailyStatType>;

export const userDailyStatSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string().date(),
  statType: dailyStatTypeSchema,
  count: z.number().int().nonnegative(),
  pointsEarned: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserDailyStat = z.infer<typeof userDailyStatSchema>;

export const leaderboardQuerySchema = z.object({
  type: z.string(),
  groupSlug: z.string().optional(),
  period: leaderboardPeriodSchema.default(LeaderboardPeriod.ALL_TIME),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userslug: z.string(),
  username: z.string(),
  score: z.number(),
  acceptedSolutions: z.number().int().nonnegative(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  leaderboard: z.array(leaderboardEntrySchema),
});

export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

export const awardPointsRequestSchema = z.object({
  userSlug: z.string(),
  points: z.number(),
  reason: z.string().min(1),
});

export type AwardPointsRequest = z.infer<typeof awardPointsRequestSchema>;
