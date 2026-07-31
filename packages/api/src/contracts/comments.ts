import { z } from 'zod';
import { publicUserProfileSchema } from './users';

export const CommentStatus = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
} as const;

export type CommentStatus = (typeof CommentStatus)[keyof typeof CommentStatus];

export const commentStatusSchema = z.nativeEnum(
  CommentStatus as Record<string, string>
) as z.ZodType<CommentStatus>;

export const commentSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  authorId: z.string().uuid(),
  parentCommentId: z.string().uuid().nullable(),
  content: z.string(),
  contentPlain: z.string(),
  upvotes: z.number().int().nonnegative(),
  status: commentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Comment = z.infer<typeof commentSchema>;

export interface CommentDetail extends z.infer<typeof commentSchema> {
  author: z.infer<typeof publicUserProfileSchema>;
  replies?: CommentDetail[];
}

export const commentDetailSchema: z.ZodType<CommentDetail> = commentSchema.extend({
  author: publicUserProfileSchema,
  replies: z.array(z.lazy(() => commentDetailSchema)).optional(),
});

export const createCommentRequestSchema = z.object({
  content: z.string().min(1),
  parentCommentId: z.string().uuid().nullable().optional(),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const patchCommentRequestSchema = z.object({
  content: z.string().min(1).optional(),
  status: commentStatusSchema.optional(),
});

export type PatchCommentRequest = z.infer<typeof patchCommentRequestSchema>;
