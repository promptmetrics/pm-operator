import { z } from 'zod';
import { userRoleSchema, type UserRole } from './users';

export const GroupVisibility = {
  PUBLIC: 'public',
  INVITE_ONLY: 'invite_only',
  PAID: 'paid',
} as const;

export type GroupVisibility =
  (typeof GroupVisibility)[keyof typeof GroupVisibility];

export const groupVisibilitySchema = z.nativeEnum(
  GroupVisibility as Record<string, string>
) as z.ZodType<GroupVisibility>;

export const MembershipStatus = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due',
  EXPIRED: 'expired',
} as const;

export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const membershipStatusSchema = z.nativeEnum(
  MembershipStatus as Record<string, string>
) as z.ZodType<MembershipStatus>;

export const TierInterval = {
  MONTH: 'month',
  YEAR: 'year',
  ONE_TIME: 'one_time',
} as const;

export type TierInterval = (typeof TierInterval)[keyof typeof TierInterval];

export const tierIntervalSchema = z.nativeEnum(
  TierInterval as Record<string, string>
) as z.ZodType<TierInterval>;

export const InviteRole = {
  MEMBER: 'member',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

export type InviteRole = (typeof InviteRole)[keyof typeof InviteRole];

export const inviteRoleSchema = z.nativeEnum(
  InviteRole as Record<string, string>
) as z.ZodType<InviteRole>;

export const membershipTierSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().default('EUR'),
  interval: tierIntervalSchema,
  features: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MembershipTier = z.infer<typeof membershipTierSchema>;

export const groupSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  visibility: groupVisibilitySchema,
  requiredTierId: z.string().uuid().nullable().optional(),
  memberCount: z.number().int().nonnegative(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Group = z.infer<typeof groupSchema>;

// Group plus the count of posts visible to the viewer (WS5/T5.2 circles rail).
export const groupWithPostCountSchema = groupSchema.extend({
  postCount: z.number().int().nonnegative(),
});

export type GroupWithPostCount = z.infer<typeof groupWithPostCountSchema>;

// Circle-page banner aggregates (WS6/T6.1). Counts respect the viewer's post
// visibility, matching groupWithPostCountSchema. solvedRate is accepted
// questions / total questions; null when the circle has no questions.
export const groupStatsSchema = z.object({
  postsThisMonth: z.number().int().nonnegative(),
  solvedRate: z.number().min(0).max(1).nullable(),
});

export type GroupStats = z.infer<typeof groupStatsSchema>;

export const groupWithStatsSchema = groupSchema.extend({
  stats: groupStatsSchema,
});

export type GroupWithStats = z.infer<typeof groupWithStatsSchema>;

// List items from GET /api/v1/groups. `stats` is present only when the caller
// passed includeStats=1; it reuses groupStatsSchema so the shape matches the
// single-group includeStats response.
export const groupListItemSchema = groupSchema.extend({
  stats: groupStatsSchema.optional(),
});

export type GroupListItem = z.infer<typeof groupListItemSchema>;

export const groupMembershipSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
  role: userRoleSchema as z.ZodType<UserRole>,
  joinedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GroupMembership = z.infer<typeof groupMembershipSchema>;

export const groupMemberSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  userslug: z.string(),
  pictureUrl: z.string().url().nullable(),
  role: userRoleSchema,
  reputationScore: z.number(),
  joinedAt: z.string().datetime(),
});

export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupInviteSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  code: z.string(),
  inviterId: z.string().uuid().nullable(),
  maxUses: z.number().int().positive(),
  usedCount: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  role: inviteRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GroupInvite = z.infer<typeof groupInviteSchema>;

export const createGroupRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  visibility: groupVisibilitySchema,
  color: z.string().optional(),
  requiredTierId: z.string().uuid().optional(),
});

export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

export const createInviteRequestSchema = z.object({
  groupSlug: z.string().min(1),
  role: inviteRoleSchema.default(InviteRole.MEMBER),
  maxUses: z.number().int().positive().default(1),
  expiresAt: z.string().datetime().optional(),
});

export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  code: z.string().min(1),
});

export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const joinGroupRequestSchema = z.object({
  inviteCode: z.string().optional(),
});

export type JoinGroupRequest = z.infer<typeof joinGroupRequestSchema>;

export const createTierRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().min(1).default('EUR'),
  interval: tierIntervalSchema,
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(false),
});

export type CreateTierRequest = z.infer<typeof createTierRequestSchema>;

export const patchTierRequestSchema = createTierRequestSchema.partial().omit({ slug: true });

export type PatchTierRequest = z.infer<typeof patchTierRequestSchema>;
