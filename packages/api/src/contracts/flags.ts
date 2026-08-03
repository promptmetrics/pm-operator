import { z } from 'zod';

export const FlagStatus = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;

export type FlagStatus = (typeof FlagStatus)[keyof typeof FlagStatus];

export const flagStatusSchema = z.nativeEnum(
  FlagStatus as Record<string, string>
) as z.ZodType<FlagStatus>;

// Flags can target posts, comments, or direct messages (D9.6 auto-flags DMs).
// Deliberately separate from the reactions targetType (post|comment only) so
// widening the flag domain never makes messages reaction-targetable.
export const FlagTargetType = {
  POST: 'post',
  COMMENT: 'comment',
  MESSAGE: 'message',
} as const;

export type FlagTargetType = (typeof FlagTargetType)[keyof typeof FlagTargetType];

export const flagTargetTypeSchema = z.nativeEnum(
  FlagTargetType as Record<string, string>
) as z.ZodType<FlagTargetType>;

export const createFlagRequestSchema = z.object({
  targetType: flagTargetTypeSchema,
  targetId: z.string().uuid(),
  reason: z.string().optional(),
});

export type CreateFlagRequest = z.infer<typeof createFlagRequestSchema>;

export const resolveFlagRequestSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolutionNote: z.string().optional(),
});

export type ResolveFlagRequest = z.infer<typeof resolveFlagRequestSchema>;

export const flagSchema = z.object({
  id: z.string().uuid(),
  targetType: flagTargetTypeSchema,
  targetId: z.string().uuid(),
  reporterId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  autoFlagged: z.boolean(),
  status: flagStatusSchema,
  resolverId: z.string().uuid().nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Flag = z.infer<typeof flagSchema>;

export const flagQuerySchema = z.object({
  status: flagStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type FlagQuery = z.infer<typeof flagQuerySchema>;

export const flagTargetPreviewSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['post', 'comment', 'message']),
  title: z.string().nullable(),
  content: z.string().nullable(),
  author: z.object({
    id: z.string().uuid(),
    username: z.string(),
    userslug: z.string(),
  }),
  // Null for DM flags (messages have no group); present for post/comment flags.
  group: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
    })
    .nullable(),
  // Post slug so the moderation queue can build /g/<groupSlug>/<postSlug> links.
  // Null for DM flags; present for post/comment flags when the post exists.
  postSlug: z.string().nullable().optional(),
  // Present only for DM flags — the conversation the message belongs to, so the
  // moderation queue can link to /messages/:conversationId.
  conversationId: z.string().uuid().nullable().optional(),
});

export type FlagTargetPreview = z.infer<typeof flagTargetPreviewSchema>;

export const flagQueueItemSchema = flagSchema.extend({
  target: flagTargetPreviewSchema,
});

export type FlagQueueItem = z.infer<typeof flagQueueItemSchema>;
