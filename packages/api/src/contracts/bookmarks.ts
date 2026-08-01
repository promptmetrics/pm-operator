import { z } from 'zod';
import { postListItemSchema } from './posts';

export const toggleBookmarkRequestSchema = z.object({
  postId: z.string().uuid(),
});

export type ToggleBookmarkRequest = z.infer<typeof toggleBookmarkRequestSchema>;

export const toggleBookmarkResponseSchema = z.object({
  bookmarked: z.boolean(),
});

export type ToggleBookmarkResponse = z.infer<typeof toggleBookmarkResponseSchema>;

export const bookmarksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type BookmarksQuery = z.infer<typeof bookmarksQuerySchema>;

export const bookmarksResponseSchema = z.object({
  posts: z.array(postListItemSchema),
  nextCursor: z.string().datetime().optional(),
});

export type BookmarksResponse = z.infer<typeof bookmarksResponseSchema>;
