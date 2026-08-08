import { z } from 'zod';
import { groupSchema } from './groups';
import { publicUserProfileSchema } from './users';
import { linkPreviewSchema } from './unfurl';

export const PostType = {
  DISCUSSION: 'discussion',
  QUESTION: 'question',
  BUILD: 'build',
  LESSON: 'lesson',
} as const;

export type PostType = (typeof PostType)[keyof typeof PostType];

export const postTypeSchema = z.nativeEnum(
  PostType as Record<string, string>
) as z.ZodType<PostType>;

export const PostStatus = {
  PUBLISHED: 'published',
  DRAFT: 'draft',
  FLAGGED: 'flagged',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
} as const;

export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export const postStatusSchema = z.nativeEnum(
  PostStatus as Record<string, string>
) as z.ZodType<PostStatus>;

export const FeedFilter = {
  ALL: 'all',
  MY_CIRCLES: 'my-circles',
  QUESTIONS: 'questions',
  SOLUTIONS: 'solutions',
  UNANSWERED: 'unanswered',
  BUILDS: 'builds',
} as const;

export type FeedFilter = (typeof FeedFilter)[keyof typeof FeedFilter];

export const feedFilterSchema = z.nativeEnum(
  FeedFilter as Record<string, string>
) as z.ZodType<FeedFilter>;

export const FeedSort = {
  NEW: 'new',
  TOP: 'top',
  TRENDING: 'trending',
} as const;

export type FeedSort = (typeof FeedSort)[keyof typeof FeedSort];

export const feedSortSchema = z.nativeEnum(
  FeedSort as Record<string, string>
) as z.ZodType<FeedSort>;

export const postSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  authorId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  content: z.string(),
  contentPlain: z.string(),
  type: postTypeSchema,
  status: postStatusSchema,
  tags: z.array(z.string()),
  upvotes: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  isPinned: z.boolean(),
  featuredLabel: z.string().nullable(),
  coverImageUrl: z.string().nullable().optional(),
  // Server-generated card for the first URL in the body; null = no card.
  linkPreview: linkPreviewSchema.nullable().optional(),
  acceptedCommentId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Post = z.infer<typeof postSchema>;

export const postListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  type: postTypeSchema,
  status: postStatusSchema,
  isSolved: z.boolean(),
  group: z.object({
    slug: z.string(),
    name: z.string(),
    color: z.string().nullable().optional(),
  }),
  author: z.object({
    userslug: z.string(),
    username: z.string(),
    reputationScore: z.number(),
    acceptedSolutions: z.number().int().nonnegative(),
    level: z.number().int().min(1),
  }),
  upvotes: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  viewerHasLiked: z.boolean().optional(),
  viewerHasBookmarked: z.boolean().optional(),
  featuredLabel: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  linkPreview: linkPreviewSchema.nullable().optional(),
});

export type PostListItem = z.infer<typeof postListItemSchema>;

export const createPostRequestSchema = z.object({
  groupSlug: z.string().min(1),
  title: z.string().min(1).max(300),
  content: z.string().min(1),
  type: postTypeSchema.default(PostType.DISCUSSION),
  tags: z.array(z.string()).default([]),
  coverImageUrl: z.string().nullable().optional(),
});

export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;

export const patchPostRequestSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).optional(),
  type: postTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  status: postStatusSchema.optional(),
  coverImageUrl: z.string().nullable().optional(),
  // Global admins or group admins/moderators only (GROUP-7).
  isPinned: z.boolean().optional(),
  // Global admins only (WS7/T7.2); null clears the feature.
  featuredLabel: z.string().max(40).nullable().optional(),
});

export type PatchPostRequest = z.infer<typeof patchPostRequestSchema>;

export const acceptSolutionRequestSchema = z.object({
  commentId: z.string().uuid(),
});

export type AcceptSolutionRequest = z.infer<typeof acceptSolutionRequestSchema>;

export const feedQuerySchema = z.object({
  groupSlug: z.string().optional(),
  filter: feedFilterSchema.default(FeedFilter.ALL),
  sort: feedSortSchema.default(FeedSort.NEW),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const feedResponseSchema = z.object({
  posts: z.array(postListItemSchema),
  nextCursor: z.string().datetime().optional(),
});

export type FeedResponse = z.infer<typeof feedResponseSchema>;

export const postDetailSchema = postSchema.extend({
  group: groupSchema,
  author: publicUserProfileSchema,
  viewerHasLiked: z.boolean().optional(),
  viewerHasBookmarked: z.boolean().optional(),
});

export type PostDetail = z.infer<typeof postDetailSchema>;
