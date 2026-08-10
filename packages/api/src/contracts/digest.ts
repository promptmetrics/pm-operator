import { z } from 'zod';

/**
 * Weekly digest contract (redesign track 2D, plan §4.4).
 *
 * The first five scalar fields are the original T8.3 payload consumed by the
 * /feed banner, the /digest page, and the Monday weekly-digest email (Loops
 * template variables weekPosts / weekSolutions / hotTopicName / hotTopicUrl /
 * topContributors). The payload is ADDITIVE: those scalars must never be
 * removed or renamed — existing consumers keep working without changes.
 */

/**
 * One row in a digest section list. `stat` is the post's comment count
 * (posts.comment_count); `upvotes`, `solved`, and `createdAt` ride along so
 * the /digest page can render the reference row shape (▲ votes, ✓ Solved,
 * age) without a second lookup.
 */
export const digestSectionItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  authorName: z.string(),
  circleName: z.string(),
  stat: z.number().int().nonnegative(),
  upvotes: z.number().int().nonnegative(),
  solved: z.boolean(),
  createdAt: z.string(),
});

export type DigestSectionItem = z.infer<typeof digestSectionItemSchema>;

export const weeklyDigestSchema = z.object({
  // -- original scalars (pre-2D payload; keep forever) --
  posts: z.number().int().nonnegative(),
  solutionsAccepted: z.number().int().nonnegative(),
  hotTopicName: z.string(),
  hotTopicUrl: z.string(),
  topContributors: z.string(),
  // -- track-2D enrichment (additive) --
  /** Distinct users who joined at least one of the scoped circles this week. */
  newMembers: z.number().int().nonnegative(),
  /** Most-commented published posts of the week (max 3). */
  topPosts: z.array(digestSectionItemSchema).max(3),
  /** Newest published 'build' posts of the week (max 3). */
  newBuilds: z.array(digestSectionItemSchema).max(3),
  /**
   * Newest published 'question' posts of the week that still have no
   * accepted solution (max 3).
   */
  unansweredQuestions: z.array(digestSectionItemSchema).max(3),
});

export type WeeklyDigest = z.infer<typeof weeklyDigestSchema>;
