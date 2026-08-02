import { z } from 'zod';
import { pageQuerySchema } from './common';
import { publicUserProfileSchema } from './users';

// Follow list pagination (GET /api/v1/users/[slug]/followers|following).
// Edge lists are self-only (decision 2A); counts are public and read from
// users.follower_count/following_count, not from this query.
export const followListQuerySchema = pageQuerySchema;
export type FollowListQuery = z.infer<typeof followListQuerySchema>;

// Each entry in a followers/following list is a public user profile.
export const followListItemSchema = publicUserProfileSchema;
export type FollowListItem = z.infer<typeof followListItemSchema>;

// POST/DELETE /api/v1/users/[slug]/follow response.
export const followResponseSchema = z.object({
  following: z.boolean(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
});
export type FollowResponse = z.infer<typeof followResponseSchema>;

// Follow-state read for a profile banner (T9.3): public counts + whether the
// viewer is following the profile subject.
export const followCountsSchema = z.object({
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  isFollowing: z.boolean(),
});
export type FollowCounts = z.infer<typeof followCountsSchema>;