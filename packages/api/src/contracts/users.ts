import { z } from 'zod';
import { userBadgesResponseSchema } from './badges';

export const UserRole = {
  MEMBER: 'member',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleSchema = z.nativeEnum(
  UserRole as Record<string, string>
) as z.ZodType<UserRole>;

/**
 * Operator level ladder — SPEC_LOG 2026-08-01 (design's Leaderboards page),
 * thresholds against the canonical 10/5/25 economy. Levels are derived from
 * users.reputation_score; nothing is stored.
 */
export const OPERATOR_LEVELS = [
  { level: 1, name: 'Newcomer', minScore: 0 },
  { level: 2, name: 'Builder', minScore: 100 },
  { level: 3, name: 'Contributor', minScore: 400 },
  { level: 4, name: 'Operator', minScore: 900 },
  { level: 5, name: 'Senior operator', minScore: 1500 },
  { level: 6, name: 'Legend', minScore: 3000 },
] as const;

export type OperatorLevel = (typeof OPERATOR_LEVELS)[number];

export interface LevelInfo {
  level: number;
  name: string;
  /** null at max level */
  nextLevel: { level: number; name: string; minScore: number } | null;
  /** points still needed for the next level; null at max level */
  pointsToNext: number | null;
  /** 0-100 progress within the current level band; 100 at max level */
  progressPercent: number;
}

export function levelForScore(score: number): LevelInfo {
  const clamped = Math.max(0, score);
  let current: OperatorLevel = OPERATOR_LEVELS[0];
  for (const candidate of OPERATOR_LEVELS) {
    if (clamped >= candidate.minScore) current = candidate;
  }
  const next = OPERATOR_LEVELS.find((l) => l.level === current.level + 1) ?? null;
  if (!next) {
    return { level: current.level, name: current.name, nextLevel: null, pointsToNext: null, progressPercent: 100 };
  }
  const bandSize = next.minScore - current.minScore;
  return {
    level: current.level,
    name: current.name,
    nextLevel: { level: next.level, name: next.name, minScore: next.minScore },
    pointsToNext: Math.max(0, next.minScore - clamped),
    progressPercent: Math.min(100, Math.round(((clamped - current.minScore) / bandSize) * 100)),
  };
}

export const userPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  newsletter: z.boolean().optional(),
  // Feed onboarding checklist (plan §4.7). `checklistDismissed` is set by the
  // card's ✕ via PATCH /api/v1/me; `checklistCompletedAt` is a write-once
  // server-side cache stamped the first time all 3 steps are complete. Either
  // key present ⇒ the feed page skips the checklist query entirely.
  checklistDismissed: z.boolean().optional(),
  checklistCompletedAt: z.string().optional(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const userPublicProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  userslug: z.string(),
  fullName: z.string().nullable(),
  pictureUrl: z.string().url().nullable(),
  role: userRoleSchema,
  reputationScore: z.number(),
  streakDays: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  painfulToolStackTask: z.string(),
  onboardingComplete: z.boolean(),
});

export type UserPublicProfile = z.infer<typeof userPublicProfileSchema>;

export const getMeResponseSchema = z.object({
  user: userPublicProfileSchema,
});

export type GetMeResponse = z.infer<typeof getMeResponseSchema>;

export const patchMeRequestSchema = z.object({
  fullName: z.string().optional(),
  aboutMe: z.string().optional(),
  pictureUrl: z.string().url().optional(),
  preferences: userPreferencesSchema.partial().optional(),
});

export type PatchMeRequest = z.infer<typeof patchMeRequestSchema>;

export const onboardingRequestSchema = z.object({
  painfulToolStackTask: z.string().min(1),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

export const publicUserProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  userslug: z.string(),
  fullName: z.string().nullable(),
  pictureUrl: z.string().url().nullable(),
  role: userRoleSchema,
  reputationScore: z.number(),
  streakDays: z.number().int().nonnegative(),
  acceptedSolutions: z.number().int().nonnegative(),
  level: z.number().int().min(1),
});

export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;

// Wire shape of levelForScore() (WS6/T6.3) — validates as LevelInfo.
export const levelInfoSchema = z.object({
  level: z.number().int().min(1),
  name: z.string(),
  nextLevel: z
    .object({ level: z.number().int(), name: z.string(), minScore: z.number() })
    .nullable(),
  pointsToNext: z.number().nullable(),
  progressPercent: z.number().min(0).max(100),
});

// Per-circle contribution row for the profile sidebar (WS6/T6.3): all-time
// group-scoped score plus solutions accepted in that circle.
export const circleContributionSchema = z.object({
  group: z.object({
    slug: z.string(),
    name: z.string(),
    color: z.string().nullable(),
  }),
  score: z.number(),
  acceptedSolutions: z.number().int().nonnegative(),
});

export type CircleContribution = z.infer<typeof circleContributionSchema>;

// Full profile-page payload (WS6/T6.3). Extends — never widens —
// publicUserProfileSchema: toPublicUserProfile also feeds mention search.
export const userProfileDetailSchema = publicUserProfileSchema.extend({
  aboutMe: z.string().nullable(),
  postsCount: z.number().int().nonnegative(),
  joinedAt: z.string().datetime(),
  levelInfo: levelInfoSchema,
  // WS9 social graph: public follow counts (trigger-maintained on users).
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
});

export type UserProfileDetail = z.infer<typeof userProfileDetailSchema>;

// GET /api/v1/users/[slug] response (REST parity for the profile redesign).
export const getUserProfileResponseSchema = z.object({
  user: userProfileDetailSchema,
  badges: userBadgesResponseSchema,
  circles: z.array(circleContributionSchema),
});

export type GetUserProfileResponse = z.infer<typeof getUserProfileResponseSchema>;

export const userListQuerySchema = z.object({
  q: z.string().optional(),
  role: userRoleSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListItemSchema = userPublicProfileSchema.extend({
  createdAt: z.string().datetime(),
});

export type UserListItem = z.infer<typeof userListItemSchema>;

export const patchUserRoleRequestSchema = z.object({
  role: userRoleSchema,
});

export type PatchUserRoleRequest = z.infer<typeof patchUserRoleRequestSchema>;

/**
 * Streak week view (T2.3): 'done' = activity that UTC day, 'pending' = today
 * without activity yet, 'empty' = no activity / future day.
 */
export const streakDayStateSchema = z.enum(['done', 'pending', 'empty']);

export type StreakDayState = z.infer<typeof streakDayStateSchema>;

export const myStreakResponseSchema = z.object({
  current: z.number().int().nonnegative(),
  best: z.number().int().nonnegative(),
  days: z
    .array(
      z.object({
        date: z.string(),
        label: z.string(),
        state: streakDayStateSchema,
      })
    )
    .length(7),
});

export type MyStreakResponse = z.infer<typeof myStreakResponseSchema>;
