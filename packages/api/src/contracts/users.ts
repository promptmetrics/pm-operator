import { z } from 'zod';

export const UserRole = {
  MEMBER: 'member',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleSchema = z.nativeEnum(
  UserRole as Record<string, string>
) as z.ZodType<UserRole>;

export const userPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  newsletter: z.boolean().optional(),
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
});

export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;

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
