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

export const badgeCriteriaSchema = z.union([
  countBadgeCriteriaSchema,
  compoundBadgeCriteriaSchema,
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
