import { z } from 'zod';
import { pointEventTypeSchema } from './points';

export const countBadgeCriteriaSchema = z.object({
  eventType: pointEventTypeSchema,
  threshold: z.number().int().positive(),
});

export type CountBadgeCriteria = z.infer<typeof countBadgeCriteriaSchema>;

export const compoundBadgeCriteriaSchema = countBadgeCriteriaSchema.extend({
  postType: z.enum(['discussion', 'question', 'build', 'lesson']).optional(),
  groupSlug: z.string().optional(),
});

export type CompoundBadgeCriteria = z.infer<typeof compoundBadgeCriteriaSchema>;

// Consecutive-days criterion (WS7/T7.1): earned against users.longest_streak_days,
// progress displayed against the current users.streak_days.
export const streakBadgeCriteriaSchema = z.object({
  type: z.literal('streak'),
  days: z.number().int().positive(),
});

export type StreakBadgeCriteria = z.infer<typeof streakBadgeCriteriaSchema>;

// compound before count: zod unions return the first successful parse and
// z.object strips unknown keys, so count-first would silently drop
// postType/groupSlug from compound criteria.
export const badgeCriteriaSchema = z.union([
  streakBadgeCriteriaSchema,
  compoundBadgeCriteriaSchema,
  countBadgeCriteriaSchema,
]);

export type BadgeCriteria = z.infer<typeof badgeCriteriaSchema>;

export const badgeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  iconUrl: z.string().url().nullable(),
  criteria: badgeCriteriaSchema,
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type Badge = z.infer<typeof badgeSchema>;

export const userBadgeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  badgeId: z.string().uuid(),
  awardedAt: z.string().datetime(),
  awardedBy: z.string().uuid().nullable(),
  context: z.record(z.unknown()).default({}),
});

export type UserBadge = z.infer<typeof userBadgeSchema>;

export const userBadgeWithBadgeSchema = userBadgeSchema.extend({
  badge: badgeSchema,
});

export type UserBadgeWithBadge = z.infer<typeof userBadgeWithBadgeSchema>;

export const grantBadgeRequestSchema = z.object({
  userSlug: z.string(),
  badgeSlug: z.string(),
});

export type GrantBadgeRequest = z.infer<typeof grantBadgeRequestSchema>;

export const createBadgeRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  criteria: badgeCriteriaSchema,
  sortOrder: z.number().int().nonnegative().default(0),
});

export type CreateBadgeRequest = z.infer<typeof createBadgeRequestSchema>;

export const awardBadgeRequestSchema = z.object({
  userSlug: z.string().min(1),
  reason: z.string().optional(),
});

export type AwardBadgeRequest = z.infer<typeof awardBadgeRequestSchema>;

// Public badge shape (WS7/T7.1): criteria omitted so manually awarded badges
// with free-form criteria jsonb still serialize.
export const publicBadgeSchema = badgeSchema.omit({ criteria: true });

export type PublicBadge = z.infer<typeof publicBadgeSchema>;

export const earnedBadgeItemSchema = z.object({
  badge: publicBadgeSchema,
  awardedAt: z.string().datetime(),
});

export type EarnedBadgeItem = z.infer<typeof earnedBadgeItemSchema>;

export const badgeProgressItemSchema = z.object({
  badge: publicBadgeSchema,
  current: z.number().int().nonnegative(),
  threshold: z.number().int().positive(),
});

export type BadgeProgressItem = z.infer<typeof badgeProgressItemSchema>;

export const userBadgesResponseSchema = z.object({
  earned: z.array(earnedBadgeItemSchema),
  progress: z.array(badgeProgressItemSchema),
});

export type UserBadgesResponse = z.infer<typeof userBadgesResponseSchema>;
