import { z } from 'zod';

export const ReactionType = {
  LIKE: 'like',
  CELEBRATE: 'celebrate',
} as const;

export type ReactionType = (typeof ReactionType)[keyof typeof ReactionType];

export const reactionTypeSchema = z.nativeEnum(
  ReactionType as Record<string, string>
) as z.ZodType<ReactionType>;

export const TargetType = {
  POST: 'post',
  COMMENT: 'comment',
} as const;

export type TargetType = (typeof TargetType)[keyof typeof TargetType];

export const targetTypeSchema = z.nativeEnum(
  TargetType as Record<string, string>
) as z.ZodType<TargetType>;

export const createReactionRequestSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  reactionType: reactionTypeSchema.default(ReactionType.LIKE),
});

export type CreateReactionRequest = z.infer<typeof createReactionRequestSchema>;

export const reactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  reactionType: reactionTypeSchema,
  createdAt: z.string().datetime(),
});

export type Reaction = z.infer<typeof reactionSchema>;
