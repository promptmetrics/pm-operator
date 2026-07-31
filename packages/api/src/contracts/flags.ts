import { z } from 'zod';
import { targetTypeSchema } from './reactions';

export const FlagStatus = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;

export type FlagStatus = (typeof FlagStatus)[keyof typeof FlagStatus];

export const flagStatusSchema = z.nativeEnum(
  FlagStatus as Record<string, string>
) as z.ZodType<FlagStatus>;

export const createFlagRequestSchema = z.object({
  targetType: targetTypeSchema,
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
  targetType: targetTypeSchema,
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
  type: z.enum(['post', 'comment']),
  title: z.string().nullable(),
  content: z.string().nullable(),
  author: z.object({
    id: z.string().uuid(),
    username: z.string(),
    userslug: z.string(),
  }),
  group: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
  }),
});

export type FlagTargetPreview = z.infer<typeof flagTargetPreviewSchema>;

export const flagQueueItemSchema = flagSchema.extend({
  target: flagTargetPreviewSchema,
});

export type FlagQueueItem = z.infer<typeof flagQueueItemSchema>;
