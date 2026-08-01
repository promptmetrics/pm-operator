import { eq, ne, and, or, sql, desc, asc, isNotNull, isNull, inArray, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { FeedQuery, FeedResponse, PostDetail, CreatePostRequest, PatchPostRequest, PostListItem } from '@pm-operator/api';
import { getAvatarReadUrl } from '../storage';
import { htmlToText } from '../html-to-text';
import { levelForScore } from '@pm-operator/api';
import { toISO, toNumber, isAdminOrModerator } from './shared';
import { autoFlagIfWatched } from './flags';

type FilterValue = FeedQuery['filter'];
type SortValue = FeedQuery['sort'];

export function postVisibilityFilter(currentUserId: string | undefined) {
  const notDeleted = sql`${schema.posts.status} <> 'deleted'`;
  if (!currentUserId) {
    return and(
      notDeleted,
      sql`${schema.groups.visibility} = 'public'`,
      sql`${schema.posts.status} <> 'hidden'`
    );
  }
  const isAuthor = eq(schema.posts.authorId, currentUserId);
  const isMember = sql`exists (
    select 1 from ${schema.groupMemberships}
    where ${schema.groupMemberships.groupId} = ${schema.posts.groupId}
      and ${schema.groupMemberships.userId} = ${currentUserId}
  )`;
  const isAdmin = sql`exists (
    select 1 from ${schema.users}
    where ${schema.users.id} = ${currentUserId}
      and ${schema.users.role} = 'admin'
  )`;

  return and(
    notDeleted,
    or(
      sql`${schema.groups.visibility} = 'public'`,
      isAuthor,
      isMember,
      isAdmin
    ),
    or(
      sql`${schema.posts.status} <> 'hidden'`,
      isAuthor,
      isAdmin,
      sql`exists (
        select 1 from ${schema.groupMemberships}
        where ${schema.groupMemberships.groupId} = ${schema.posts.groupId}
          and ${schema.groupMemberships.userId} = ${currentUserId}
          and ${schema.groupMemberships.role} in ('admin', 'moderator')
      )`
    )
  );
}

function filterClause(filter: FilterValue, currentUserId: string | undefined) {
  switch (filter) {
    case 'my-circles':
      if (!currentUserId) return sql`false`;
      return sql`exists (
        select 1 from ${schema.groupMemberships}
        where ${schema.groupMemberships.groupId} = ${schema.posts.groupId}
          and ${schema.groupMemberships.userId} = ${currentUserId}
      )`;
    case 'questions':
      return eq(schema.posts.type, 'question');
    case 'solutions':
      return isNotNull(schema.posts.acceptedCommentId);
    case 'unanswered':
      return and(eq(schema.posts.type, 'question'), isNull(schema.posts.acceptedCommentId));
    case 'builds':
      return eq(schema.posts.type, 'build');
    default:
      return undefined;
  }
}

function orderByClause(sort: SortValue) {
  switch (sort) {
    case 'top':
      return [desc(schema.posts.upvotes), desc(schema.posts.createdAt)];
    case 'trending':
      return [desc(schema.posts.viewCount), desc(schema.posts.upvotes)];
    default:
      return [desc(schema.posts.createdAt)];
  }
}

export function viewerHasLikedPostSql(currentUserId: string | undefined) {
  if (!currentUserId) return sql<boolean>`false`;
  return sql<boolean>`exists (
    select 1 from ${schema.reactions}
    where ${schema.reactions.userId} = ${currentUserId}
      and ${schema.reactions.targetType} = 'post'
      and ${schema.reactions.targetId} = ${schema.posts.id}
  )`;
}

export function viewerHasBookmarkedPostSql(currentUserId: string | undefined) {
  if (!currentUserId) return sql<boolean>`false`;
  return sql<boolean>`exists (
    select 1 from ${schema.savedPosts}
    where ${schema.savedPosts.userId} = ${currentUserId}
      and ${schema.savedPosts.postId} = ${schema.posts.id}
  )`;
}

export async function toPostListItem(
  row: {
    post: typeof schema.posts.$inferSelect;
    group: typeof schema.groups.$inferSelect;
    author: typeof schema.users.$inferSelect;
    acceptedSolutions: string | number | null;
    viewerHasLiked?: boolean | null;
    viewerHasBookmarked?: boolean | null;
  }
): Promise<PostListItem> {
  return {
    id: row.post.id,
    title: row.post.title,
    type: row.post.type,
    status: row.post.status,
    isSolved: row.post.acceptedCommentId !== null,
    group: {
      slug: row.group.slug,
      name: row.group.name,
      color: row.group.color,
    },
    author: {
      userslug: row.author.userslug,
      username: row.author.username,
      reputationScore: toNumber(row.author.reputationScore),
      acceptedSolutions: toNumber(row.acceptedSolutions),
      level: levelForScore(toNumber(row.author.reputationScore)).level,
    },
    upvotes: row.post.upvotes,
    commentCount: row.post.commentCount,
    viewCount: row.post.viewCount,
    tags: row.post.tags,
    createdAt: toISO(row.post.createdAt),
    viewerHasLiked: Boolean(row.viewerHasLiked),
    viewerHasBookmarked: Boolean(row.viewerHasBookmarked),
    featuredLabel: row.post.featuredLabel,
  };
}

export interface ListFeedOptions {
  /** Omit this post from results (post-page "More from this circle" rail). */
  excludePostId?: string;
}

export async function listFeed(
  db: DrizzleClient,
  query: FeedQuery,
  currentUserId?: string,
  opts?: ListFeedOptions
): Promise<FeedResponse> {
  const { filter, sort, page, limit } = query;

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

  const conditions = [postVisibilityFilter(currentUserId), filterClause(filter, currentUserId)];
  if (query.groupSlug) {
    conditions.push(eq(schema.groups.slug, query.groupSlug));
  }
  if (opts?.excludePostId) {
    conditions.push(ne(schema.posts.id, opts.excludePostId));
  }
  const where = and(...conditions.filter(Boolean));

  const rows = await db
    .with(asCount)
    .select({
      post: schema.posts,
      group: schema.groups,
      author: schema.users,
      acceptedSolutions: asCount.count,
      viewerHasLiked: viewerHasLikedPostSql(currentUserId),
      viewerHasBookmarked: viewerHasBookmarkedPostSql(currentUserId),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(where)
    .orderBy(...orderByClause(sort))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const posts = rows.slice(0, limit);
  const lastPost = posts[posts.length - 1];
  const nextCursor = hasMore && lastPost ? toISO(lastPost.post.createdAt) : undefined;

  return {
    posts: await Promise.all(posts.map(toPostListItem)),
    nextCursor,
  };
}

export async function listGroupPosts(
  db: DrizzleClient,
  slug: string,
  query: Omit<FeedQuery, 'groupSlug'>,
  currentUserId?: string,
  opts?: ListFeedOptions
): Promise<FeedResponse> {
  return listFeed(db, { ...query, groupSlug: slug }, currentUserId, opts);
}

// Latest featured post (WS7/T7.2). community.ts#listPinnedPosts is
// group-scoped, so the global feed variants live here.
export async function getFeaturedPost(
  db: DrizzleClient,
  currentUserId?: string
): Promise<PostListItem | null> {
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
      viewerHasLiked: viewerHasLikedPostSql(currentUserId),
      viewerHasBookmarked: viewerHasBookmarkedPostSql(currentUserId),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(and(isNotNull(schema.posts.featuredLabel), postVisibilityFilter(currentUserId)))
    .orderBy(desc(schema.posts.createdAt))
    .limit(1);

  if (!rows[0]) return null;
  return toPostListItem(rows[0]);
}

export async function listGlobalPinnedPosts(
  db: DrizzleClient,
  currentUserId?: string,
  limit = 3
): Promise<PostListItem[]> {
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
      viewerHasLiked: viewerHasLikedPostSql(currentUserId),
      viewerHasBookmarked: viewerHasBookmarkedPostSql(currentUserId),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(and(eq(schema.posts.isPinned, true), postVisibilityFilter(currentUserId)))
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit);

  return Promise.all(rows.map(toPostListItem));
}

export async function getPostById(
  db: DrizzleClient,
  id: string,
  currentUserId?: string
): Promise<PostDetail | null> {
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

  const row = await db
    .with(asCount)
    .select({
      post: schema.posts,
      group: schema.groups,
      author: schema.users,
      acceptedSolutions: asCount.count,
      viewerHasLiked: viewerHasLikedPostSql(currentUserId),
      viewerHasBookmarked: viewerHasBookmarkedPostSql(currentUserId),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(
      and(
        eq(schema.posts.id, id),
        postVisibilityFilter(currentUserId)
      )
    )
    .limit(1);

  if (!row[0]) return null;
  const { post, group, author, acceptedSolutions, viewerHasLiked, viewerHasBookmarked } = row[0];

  return {
    id: post.id,
    groupId: post.groupId,
    authorId: post.authorId,
    title: post.title,
    content: post.status === 'hidden' && post.authorId !== currentUserId && !isAdminOrModerator(author.role) ? '' : post.content,
    contentPlain: post.status === 'hidden' && post.authorId !== currentUserId && !isAdminOrModerator(author.role) ? '' : post.contentPlain,
    type: post.type,
    status: post.status,
    tags: post.tags,
    upvotes: post.upvotes,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    isPinned: post.isPinned,
    featuredLabel: post.featuredLabel,
    acceptedCommentId: post.acceptedCommentId,
    createdAt: toISO(post.createdAt),
    updatedAt: toISO(post.updatedAt),
    viewerHasLiked: Boolean(viewerHasLiked),
    viewerHasBookmarked: Boolean(viewerHasBookmarked),
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      color: group.color,
      visibility: group.visibility,
      requiredTierId: group.requiredTierId,
      memberCount: group.memberCount,
      createdBy: group.createdBy,
      createdAt: toISO(group.createdAt),
      updatedAt: toISO(group.updatedAt),
    },
    author: {
      id: author.id,
      username: author.username,
      userslug: author.userslug,
      fullName: author.fullName,
      pictureUrl: await getAvatarReadUrl(author.pictureUrl),
      role: author.role,
      reputationScore: toNumber(author.reputationScore),
      streakDays: author.streakDays,
      acceptedSolutions: toNumber(acceptedSolutions),
      level: levelForScore(toNumber(author.reputationScore)).level,
    },
  };
}

export async function createPost(
  db: DrizzleClient,
  input: CreatePostRequest,
  authorId: string
): Promise<PostDetail> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, input.groupSlug),
  });
  if (!group) throw new Error('Group not found');

  const canPost =
    (await db.query.groupMemberships.findFirst({
      where: and(
        eq(schema.groupMemberships.groupId, group.id),
        eq(schema.groupMemberships.userId, authorId)
      ),
    })) ||
    (await db.query.users.findFirst({
      where: eq(schema.users.id, authorId),
      columns: { role: true },
    }))?.role === 'admin';

  if (!canPost) throw new Error('Forbidden');

  const contentPlain = htmlToText(input.content);

  const post = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.posts)
      .values({
        groupId: group.id,
        authorId,
        title: input.title,
        content: input.content,
        contentPlain,
        type: input.type,
        tags: input.tags,
      })
      .returning();

    if (!created) throw new Error('Failed to create post');

    await autoFlagIfWatched(tx, created.contentPlain, 'post', created.id);

    return created;
  });

  const detail = await getPostById(db, post.id, authorId);
  if (!detail) throw new Error('Failed to load created post');
  return detail;
}

export async function updatePost(
  db: DrizzleClient,
  id: string,
  input: PatchPostRequest,
  currentUserId: string
): Promise<PostDetail> {
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, id),
  });
  if (!post) throw new Error('Post not found');

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, currentUserId),
    columns: { role: true },
  });
  const isGroupMod = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, post.groupId),
      eq(schema.groupMemberships.userId, currentUserId),
      inArray(schema.groupMemberships.role, ['admin', 'moderator'])
    ),
  });
  const canEdit = post.authorId === currentUserId || isAdminOrModerator(user?.role ?? '') || Boolean(isGroupMod);
  if (!canEdit) throw new Error('Forbidden');

  const update: Partial<typeof schema.posts.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) update.title = input.title;
  if (input.content !== undefined) {
    update.content = input.content;
    update.contentPlain = htmlToText(input.content);
  }
  if (input.type !== undefined) update.type = input.type;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.status !== undefined) update.status = input.status;
  if (input.featuredLabel !== undefined) {
    // Featuring is a global-admin-only action (WS7/T7.2).
    if (user?.role !== 'admin') throw new Error('Forbidden');
    update.featuredLabel = input.featuredLabel;
  }
  if (input.isPinned !== undefined) {
    // Pinning: global admins or the group's admins/moderators (GROUP-7).
    if (user?.role !== 'admin' && !isGroupMod) throw new Error('Forbidden');
    update.isPinned = input.isPinned;
  }

  const [updated] = await db
    .update(schema.posts)
    .set(update)
    .where(eq(schema.posts.id, id))
    .returning();

  if (!updated) throw new Error('Failed to update post');

  const detail = await getPostById(db, updated.id, currentUserId);
  if (!detail) throw new Error('Failed to load updated post');
  return detail;
}

export async function deletePost(
  db: DrizzleClient,
  id: string,
  currentUserId: string
): Promise<PostDetail> {
  return updatePost(db, id, { status: 'hidden' }, currentUserId);
}
