import { z } from 'zod';

/**
 * Admin dashboard analytics v2 (redesign plan §4.5).
 *
 * Additive on GET /api/v1/admin/analytics via section=dashboard; the legacy
 * overview/members/engagement sections (admin KpiCards) are unchanged until
 * the Phase 6 UI ships.
 */

export const adminDashboardWindowSchema = z.object({
  current: z.number(),
  prior: z.number(),
});

export type AdminDashboardWindow = z.infer<typeof adminDashboardWindowSchema>;

/** null = no qualifying rows in that window (e.g. no questions asked). */
export const adminDashboardNullableWindowSchema = z.object({
  current: z.number().nullable(),
  prior: z.number().nullable(),
});

export type AdminDashboardNullableWindow = z.infer<
  typeof adminDashboardNullableWindowSchema
>;

export const adminDashboardWeeklySchema = z.object({
  /** Published posts created in the window. */
  postsCreated: adminDashboardWindowSchema,
  /** Accepted-answer rate over questions created in the window, 0..1. */
  solvedRate: adminDashboardNullableWindowSchema,
  /** Members with last_active_at in the window. */
  activeMembers: adminDashboardWindowSchema,
  /** Median seconds from question creation to its first published comment. */
  medianTimeToFirstAnswerSeconds: adminDashboardNullableWindowSchema,
});

export type AdminDashboardWeekly = z.infer<typeof adminDashboardWeeklySchema>;

export const adminDashboardTrendPointSchema = z.object({
  /** YYYY-MM-DD */
  date: z.string(),
  count: z.number().int().nonnegative(),
});

export type AdminDashboardTrendPoint = z.infer<
  typeof adminDashboardTrendPointSchema
>;

export const adminDashboardOnboardingSchema = z.enum(['onboarded', 'stalled']);

export type AdminDashboardOnboarding = z.infer<
  typeof adminDashboardOnboardingSchema
>;

export const adminDashboardSourceSchema = z.enum([
  'github',
  'google',
  'linkedin',
  'invite',
]);

export type AdminDashboardSource = z.infer<typeof adminDashboardSourceSchema>;

export const adminDashboardMemberSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  userslug: z.string(),
  pictureUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  onboarding: adminDashboardOnboardingSchema,
  source: adminDashboardSourceSchema,
});

export type AdminDashboardMember = z.infer<typeof adminDashboardMemberSchema>;

export const adminDashboardAttentionKindSchema = z.enum([
  'open_flag',
  'stalled_signup',
  'unanswered_question',
]);

export type AdminDashboardAttentionKind = z.infer<
  typeof adminDashboardAttentionKindSchema
>;

export const adminDashboardAttentionItemSchema = z.object({
  kind: adminDashboardAttentionKindSchema,
  /** flag id / user id / post id depending on kind. */
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string().datetime(),
});

export type AdminDashboardAttentionItem = z.infer<
  typeof adminDashboardAttentionItemSchema
>;

export const adminDashboardSchema = z.object({
  weekly: adminDashboardWeeklySchema,
  postsPerDay: z.array(adminDashboardTrendPointSchema),
  newestMembers: z.array(adminDashboardMemberSchema),
  needsAttention: z.array(adminDashboardAttentionItemSchema),
});

export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
