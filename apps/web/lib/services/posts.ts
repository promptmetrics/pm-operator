import { eq, ne, lt, and, or, sql, desc, asc, isNotNull, isNull, inArray, count } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { FeedQuery, FeedResponse, PostDetail, CreatePostRequest, PatchPostRequest, PostListItem } from '@pm-operator/api';
import { getAvatarReadUrl, postImageProxyUrl } from '../storage';
import { htmlToText } from '../html-to-text';
import { sanitizeHtml } from '../sanitize-html';
import { levelForScore } from '@pm-operator/api';
import { toISO, toNumber, toExcerpt, isAdminOrModerator, redactForViewer } from './shared';
import { autoFlagIfWatched } from './flags';
import { buildLinkPreview } from './unfurl';
import { pingIndexNow } from '../indexnow';
import { getPublicSiteUrl } from '../site-url';

const POST_IMAGE_PATH_PREFIX = '/post-images/';

/**
 * Rewrite stored post-image paths (`/post-images/<userId>/<uuid>`) to the
 * stable same-origin proxy (`/api/img/...`). External URLs and other paths are
 * left as-is. Pure string transform — no Supabase signing round trips, and the
 * emitted URLs never expire (signed URLs died hourly, which broke crawlers,
 * caches, and Google Images).
 */
function resolvePostImageUrls(html: string): string {
  if (!html.includes(POST_IMAGE_PATH_PREFIX)) return html;

  const imgRe = /<img\b([^>]*?)src=["'](\/post-images\/[^"']+)["']([^>]*?)>/gi;
  return html.replace(imgRe, (_full, before, src, after) => {
    const proxied = postImageProxyUrl(src);
    return `<img${before}src="${proxied ?? src}"${after}>`;
  });
}

function resolveCoverImageUrl(path: string | null | undefined): string | null {
  return postImageProxyUrl(path);
}

function formatPostContent(content: string | null, isHidden: boolean): string {
  if (isHidden || !content) return '';
  return resolvePostImageUrls(sanitizeHtml(content));
}

type FilterValue = FeedQuery['filter'];
type SortValue = FeedQuery['sort'];

/**
 * Title → URL slug, capped at 60 characters on a word boundary.
 *
 * The cap used to be a bare `.slice(0, 60)` applied AFTER the trailing-dash
 * trim, so it cut mid-word and left behind the dash it had just removed — which
 * is why a live post sits at
 * `.../agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-`.
 * Dropping the partial trailing word, then re-trimming, fixes both.
 *
 * Exported for tests. Existing slugs are deliberately NOT migrated: those URLs
 * are already in Google's crawl queue and a redirect costs more than the
 * cosmetic gain, so this only affects posts created from now on.
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length <= 60) return base;

  // A single word longer than 60 chars has no hyphen to cut at, so the first
  // replace no-ops and the hard truncation stands rather than emptying the
  // string. `|| 'post'` in uniquePostSlug covers the empty case regardless.
  return base
    .slice(0, 60)
    .replace(/-[^-]*$/, '')
    .replace(/-+$/, '');
}

async function uniquePostSlug(
  db: DrizzleClient,
  groupId: string,
  title: string
): Promise<string> {
  let base = slugify(title) || 'post';
  let slug = base;
  let counter = 1;
  while (
    await db.query.posts.findFirst({
      where: and(eq(schema.posts.groupId, groupId), eq(schema.posts.slug, slug)),
      columns: { id: true },
    })
  ) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
}

// The single visibility chokepoint. Post pages are publicly readable (see the
// note on COMMUNITY_ROUTE_REGEX in middleware.ts), so this filter — not the
// auth gate — is what stands between the open internet and the posts table.
// Import it; do not re-implement it. search.ts and community.ts each carried a
// private copy, and all three drifted into the same hole.
//
// Both branches allowlist `published` rather than denylisting bad statuses.
// Declining a post in the approval queue sets it to `draft`
// (api/v1/admin/moderation/approval), and a denylist naming only
// `deleted`/`hidden` left declined posts world-readable at their slug. With an
// allowlist, anything later added to postStatusEnum is private by default.
export function postVisibilityFilter(currentUserId: string | undefined) {
  const isPublished = sql`${schema.posts.status} = 'published'`;
  if (!currentUserId) {
    return and(sql`${schema.groups.visibility} = 'public'`, isPublished);
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

  // Deleted is absolute — not even the author gets it back.
  return and(
    sql`${schema.posts.status} <> 'deleted'`,
    or(
      sql`${schema.groups.visibility} = 'public'`,
      isAuthor,
      isMember,
      isAdmin
    ),
    // Unpublished (draft/flagged/hidden) is visible only to the author, a
    // global admin, or a moderator of the circle it lives in.
    or(
      isPublished,
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

/**
 * True when the VIEWER may read content that isn't published — a global
 * admin/moderator, or an admin/moderator of the circle the row lives in.
 *
 * Redaction checks used to test `author.role`, the role of whoever wrote the
 * post, which is the wrong person entirely: a hidden post by an admin rendered
 * unredacted to everyone, and a circle moderator got redacted content they were
 * entitled to see. Pass the group-id column of whichever table you're querying.
 *
 * Correlated subquery on purpose — folding it into the existing SELECT costs no
 * extra round-trip, and the connection pool is too small to spend one here.
 */
export function viewerCanModerateSql(
  currentUserId: string | undefined,
  groupIdRef: SQL | AnyColumn
) {
  if (!currentUserId) return sql<boolean>`false`;
  return sql<boolean>`(
    exists (
      select 1 from ${schema.users}
      where ${schema.users.id} = ${currentUserId}
        and ${schema.users.role} in ('admin', 'moderator')
    )
    or exists (
      select 1 from ${schema.groupMemberships}
      where ${schema.groupMemberships.groupId} = ${groupIdRef}
        and ${schema.groupMemberships.userId} = ${currentUserId}
        and ${schema.groupMemberships.role} in ('admin', 'moderator')
    )
  )`;
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
    slug: row.post.slug,
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
    excerpt: toExcerpt(row.post.contentPlain),
    createdAt: toISO(row.post.createdAt),
    viewerHasLiked: Boolean(row.viewerHasLiked),
    viewerHasBookmarked: Boolean(row.viewerHasBookmarked),
    featuredLabel: row.post.featuredLabel,
    coverImageUrl: resolveCoverImageUrl(row.post.coverImageUrl),
    linkPreview: row.post.linkPreview ?? null,
  };
}

export interface ListFeedOptions {
  /** Omit this post from results (post-page "More from this circle" rail). */
  excludePostId?: string;
  /**
   * Only posts created strictly before this instant ("Help someone today"
   * rail widget, plan §4.8: unanswered questions older than 4 hours).
   */
  createdBefore?: Date;
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
  if (opts?.createdBefore) {
    conditions.push(lt(schema.posts.createdAt, opts.createdBefore));
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
      viewerCanModerate: viewerCanModerateSql(currentUserId, schema.posts.groupId),
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
  const { post, group, author, acceptedSolutions, viewerHasLiked, viewerHasBookmarked, viewerCanModerate } = row[0];

  const isHidden = redactForViewer(post.status, post.authorId, currentUserId, viewerCanModerate);

  return {
    id: post.id,
    slug: post.slug,
    groupId: post.groupId,
    authorId: post.authorId,
    title: post.title,
    content: formatPostContent(post.content, isHidden),
    contentPlain: isHidden ? '' : post.contentPlain,
    coverImageUrl: resolveCoverImageUrl(post.coverImageUrl),
    linkPreview: isHidden ? null : (post.linkPreview ?? null),
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

export async function getPostBySlug(
  db: DrizzleClient,
  groupSlug: string,
  postSlug: string,
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
      viewerCanModerate: viewerCanModerateSql(currentUserId, schema.posts.groupId),
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(
      and(
        eq(schema.groups.slug, groupSlug),
        eq(schema.posts.slug, postSlug),
        postVisibilityFilter(currentUserId)
      )
    )
    .limit(1);

  if (!row[0]) return null;
  const { post, group, author, acceptedSolutions, viewerHasLiked, viewerHasBookmarked, viewerCanModerate } = row[0];

  const isHidden = redactForViewer(post.status, post.authorId, currentUserId, viewerCanModerate);

  return {
    id: post.id,
    slug: post.slug,
    groupId: post.groupId,
    authorId: post.authorId,
    title: post.title,
    content: formatPostContent(post.content, isHidden),
    contentPlain: isHidden ? '' : post.contentPlain,
    coverImageUrl: resolveCoverImageUrl(post.coverImageUrl),
    linkPreview: isHidden ? null : (post.linkPreview ?? null),
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
  const slug = await uniquePostSlug(db, group.id, input.title);
  // Server-side unfurl of the first URL (track 2A). No DB queries inside;
  // failures resolve to null and never block the save.
  const linkPreview = await buildLinkPreview(input.content, contentPlain);

  const post = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.posts)
      .values({
        groupId: group.id,
        authorId,
        slug,
        title: input.title,
        content: input.content,
        contentPlain,
        type: input.type,
        tags: input.tags,
        coverImageUrl: input.coverImageUrl,
        linkPreview,
      })
      .returning();

    if (!created) throw new Error('Failed to create post');

    await autoFlagIfWatched(tx, created.contentPlain, 'post', created.id);

    return created;
  });

  const detail = await getPostById(db, post.id, authorId);
  if (!detail) throw new Error('Failed to load created post');

  // Fire-and-forget (pingIndexNow never throws): only anonymously-visible
  // posts get announced, mirroring the sitemap predicate.
  if (detail.group.visibility === 'public' && detail.status === 'published') {
    pingIndexNow([`${getPublicSiteUrl()}/g/${detail.group.slug}/${detail.slug}`]);
  }

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
  if (input.coverImageUrl !== undefined) update.coverImageUrl = input.coverImageUrl;
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

  // Ping only for content-visible changes — pin/feature toggles don't alter
  // what a crawler sees. Status changes ping too: on hide/delete IndexNow's
  // deletion signal is the same ping, and the crawler then finds the 404.
  // Public-group check mirrors the sitemap predicate.
  const contentChanged =
    input.title !== undefined ||
    input.content !== undefined ||
    input.status !== undefined ||
    input.coverImageUrl !== undefined;
  if (contentChanged && detail.group.visibility === 'public') {
    pingIndexNow([`${getPublicSiteUrl()}/g/${detail.group.slug}/${detail.slug}`]);
  }

  return detail;
}

export async function deletePost(
  db: DrizzleClient,
  id: string,
  currentUserId: string
): Promise<PostDetail> {
  return updatePost(db, id, { status: 'hidden' }, currentUserId);
}
