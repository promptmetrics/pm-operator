import { eq, and, sql, desc, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { PostListItem } from '@pm-operator/api';
import {
  postVisibilityFilter,
  toPostListItem,
  viewerHasLikedPostSql,
  viewerHasBookmarkedPostSql,
} from './posts';

export async function toggleBookmark(
  db: DrizzleClient,
  userId: string,
  postId: string
): Promise<{ bookmarked: boolean }> {
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
    columns: { id: true, status: true },
  });
  if (!post || post.status === 'deleted') throw new Error('Post not found');

  // Single-statement toggle, same DELETE-or-INSERT CTE shape as reactions.ts.
  const rows = await db.execute<{ action: 'created' | 'removed' }>(sql`
    WITH existing AS (
      DELETE FROM ${schema.savedPosts}
      WHERE ${schema.savedPosts.userId} = ${userId}
        AND ${schema.savedPosts.postId} = ${postId}
      RETURNING 'removed'::text AS action
    ),
    inserted AS (
      INSERT INTO ${schema.savedPosts} (id, user_id, post_id, created_at)
      SELECT gen_random_uuid(), ${userId}, ${postId}, now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING 'created'::text AS action
    )
    SELECT * FROM existing
    UNION ALL
    SELECT * FROM inserted
  `);

  const row = rows[0];
  if (!row) throw new Error('Failed to toggle bookmark');

  return { bookmarked: row.action === 'created' };
}

export async function listBookmarkedPosts(
  db: DrizzleClient,
  userId: string,
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {}
): Promise<{ posts: PostListItem[]; hasMore: boolean }> {
  const asCount = db.$with('as_count').as(
    db
      .select({
        userId: schema.comments.authorId,
        count: count().as('count'),
      })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
      .groupBy(schema.comments.authorId)
  );

  const rows = await db
    .with(asCount)
    .select({
      post: schema.posts,
      group: schema.groups,
      author: schema.users,
      acceptedSolutions: asCount.count,
      viewerHasLiked: viewerHasLikedPostSql(userId),
      viewerHasBookmarked: viewerHasBookmarkedPostSql(userId),
    })
    .from(schema.savedPosts)
    .innerJoin(schema.posts, eq(schema.savedPosts.postId, schema.posts.id))
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(and(eq(schema.savedPosts.userId, userId), postVisibilityFilter(userId)))
    .orderBy(desc(schema.savedPosts.createdAt))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const posts = await Promise.all(rows.slice(0, limit).map(toPostListItem));

  return { posts, hasMore };
}
