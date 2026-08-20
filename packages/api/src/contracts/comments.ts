import { z } from 'zod';
import { publicUserProfileSchema } from './users';
import { linkPreviewSchema } from './unfurl';

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
  // Server-generated card for the first URL in the body; null = no card.
  linkPreview: linkPreviewSchema.nullable().optional(),
  upvotes: z.number().int().nonnegative(),
  status: commentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Comment = z.infer<typeof commentSchema>;

export interface CommentDetail extends z.infer<typeof commentSchema> {
  author: z.infer<typeof publicUserProfileSchema>;
  replies?: CommentDetail[];
  viewerHasLiked?: boolean;
  // Populated when comments are listed outside the post detail page (e.g. profile).
  postSlug?: string;
  groupSlug?: string;
}

export const commentDetailSchema: z.ZodType<CommentDetail> = commentSchema.extend({
  author: publicUserProfileSchema,
  replies: z.array(z.lazy(() => commentDetailSchema)).optional(),
  viewerHasLiked: z.boolean().optional(),
  postSlug: z.string().optional(),
  groupSlug: z.string().optional(),
});

export const commentSortSchema = z.enum(['new', 'top']);

export type CommentSort = z.infer<typeof commentSortSchema>;

export const commentsQuerySchema = z.object({
  sort: commentSortSchema.default('top'),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CommentsQuery = z.infer<typeof commentsQuerySchema>;

// GET /posts/:id/comments response payload (`data`). Root comments are paged
// (`meta` carries page/limit/hasMore); the accepted solution — when the post
// has one — is returned separately in `acceptedComment` (hoisted per
// 07-ux-spec:301) and never appears in `comments`.
//
// `total` counts every comment THIS viewer may see on the post — roots, replies
// and the accepted solution, across all pages. It is deliberately not
// posts.comment_count: that column counts only `published` rows, while the list
// also hands hidden tombstones to members and moderators. Render `total`, never
// the column, or the heading disagrees with the thread under it.
export const commentListResponseSchema = z.object({
  comments: z.array(commentDetailSchema),
  acceptedComment: commentDetailSchema.nullable().optional(),
  total: z.number().int().nonnegative(),
});

export type CommentListResponse = z.infer<typeof commentListResponseSchema>;

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
