import { eq, and, or, sql, asc, desc, ne, isNull, inArray } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import { comments, posts, users, groups, groupMemberships, reactions } from '@pm-operator/db';
import type {
  Comment,
  CommentDetail,
  CommentSort,
  CreateCommentRequest,
  PatchCommentRequest,
  AcceptSolutionRequest,
} from '@pm-operator/api';
import { POINT_WEIGHTS, levelForScore } from '@pm-operator/api';
import { getAvatarReadUrl } from '../storage';
import { htmlToText } from '../html-to-text';
import { toISO, toNumber, isAdminOrModerator } from './shared';
import { insertNotification } from './notifications';
import { awardPoints, trackDailyStat, advanceStreak } from './points';
import { sendTransactional } from '../email';
import { autoFlagIfWatched } from './flags';

function commentVisibilityFilter(currentUserId: string | undefined) {
  const notDeleted = sql`${comments.status} <> 'deleted'`;
  if (!currentUserId) {
    return and(
      notDeleted,
      sql`${comments.status} <> 'hidden'`,
      sql`${groups.visibility} = 'public'`,
      sql`${posts.status} <> 'deleted'`
    );
  }
  const isAuthor = eq(comments.authorId, currentUserId);
  const isAdmin = sql`exists (
    select 1 from ${users}
    where ${users.id} = ${currentUserId} and ${users.role} = 'admin'
  )`;
  const isGroupMod = sql`exists (
    select 1 from ${groupMemberships}
    where ${groupMemberships.groupId} = ${groups.id}
      and ${groupMemberships.userId} = ${currentUserId}
      and ${groupMemberships.role} in ('admin', 'moderator')
  )`;

  return and(
    notDeleted,
    sql`${posts.status} <> 'deleted'`,
    or(
      and(sql`${groups.visibility} = 'public'`, sql`${comments.status} <> 'hidden'`),
      isAuthor,
      isAdmin,
      isGroupMod,
      sql`exists (
        select 1 from ${groupMemberships}
        where ${groupMemberships.groupId} = ${groups.id}
          and ${groupMemberships.userId} = ${currentUserId}
      )`
    )
  );
}

function viewerHasLikedCommentSql(currentUserId: string | undefined) {
  if (!currentUserId) return sql<boolean>`false`;
  return sql<boolean>`exists (
    select 1 from ${reactions}
    where ${reactions.userId} = ${currentUserId}
      and ${reactions.targetType} = 'comment'
      and ${reactions.targetId} = ${comments.id}
  )`;
}

async function toCommentDetail(
  row: typeof comments.$inferSelect,
  author: typeof users.$inferSelect,
  currentUserId?: string,
  viewerHasLiked?: boolean | null
): Promise<CommentDetail> {
  const isHidden = row.status === 'hidden' && row.authorId !== currentUserId && !isAdminOrModerator(author.role);
  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    parentCommentId: row.parentCommentId,
    content: isHidden ? '' : row.content,
    contentPlain: isHidden ? '' : row.contentPlain,
    upvotes: row.upvotes,
    status: row.status,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
    viewerHasLiked: viewerHasLiked == null ? undefined : Boolean(viewerHasLiked),
    author: {
      id: author.id,
      username: author.username,
      userslug: author.userslug,
      fullName: author.fullName,
      pictureUrl: await getAvatarReadUrl(author.pictureUrl),
      role: author.role,
      reputationScore: toNumber(author.reputationScore),
      streakDays: author.streakDays,
      acceptedSolutions: 0,
      level: levelForScore(toNumber(author.reputationScore)).level,
    },
  };
}

export interface ListCommentsOptions {
  sort: CommentSort;
  limit: number;
  offset: number;
}

export interface CommentListPage {
  /** Paged root comments (accepted solution excluded), replies nested chronologically. */
  comments: CommentDetail[];
  /** The post's accepted solution (hoisted per 07-ux-spec:301), null when none or not visible. */
  acceptedComment: CommentDetail | null;
  hasMore: boolean;
}

function commentSelect(db: DrizzleClient, currentUserId?: string) {
  return db
    .select({
      comment: comments,
      author: users,
      viewerHasLiked: viewerHasLikedCommentSql(currentUserId),
    })
    .from(comments)
    .innerJoin(posts, eq(comments.postId, posts.id))
    .innerJoin(groups, eq(posts.groupId, groups.id))
    .innerJoin(users, eq(comments.authorId, users.id));
}

export async function listCommentsForPost(
  db: DrizzleClient,
  postId: string,
  currentUserId?: string
): Promise<CommentDetail[]>;
export async function listCommentsForPost(
  db: DrizzleClient,
  postId: string,
  currentUserId: string | undefined,
  opts: ListCommentsOptions
): Promise<CommentListPage>;
export async function listCommentsForPost(
  db: DrizzleClient,
  postId: string,
  currentUserId?: string,
  opts?: ListCommentsOptions
): Promise<CommentDetail[] | CommentListPage> {
  if (!opts) {
    // Legacy shape: full thread, chronological (mcp.ts summarize_thread).
    const rows = await commentSelect(db, currentUserId)
      .where(
        and(
          eq(comments.postId, postId),
          commentVisibilityFilter(currentUserId)
        )
      )
      .orderBy(comments.createdAt);

    const byId = new Map<string, CommentDetail>();
    const roots: CommentDetail[] = [];

    for (const { comment: commentRow, author, viewerHasLiked } of rows) {
      const detail = await toCommentDetail(commentRow, author, currentUserId, viewerHasLiked);
      detail.replies = [];
      byId.set(detail.id, detail);
      if (detail.parentCommentId) {
        const parent = byId.get(detail.parentCommentId);
        parent?.replies?.push(detail);
      } else {
        roots.push(detail);
      }
    }

    return roots;
  }

  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    columns: { acceptedCommentId: true },
  });
  const acceptedId = post?.acceptedCommentId ?? null;

  // Root comments only are paged; the accepted solution is always excluded
  // here and returned separately (hoisted first regardless of sort).
  const rootConditions = [
    eq(comments.postId, postId),
    isNull(comments.parentCommentId),
    commentVisibilityFilter(currentUserId),
  ];
  if (acceptedId) rootConditions.push(ne(comments.id, acceptedId));

  const rootOrder =
    opts.sort === 'new'
      ? [desc(comments.createdAt)]
      : [desc(comments.upvotes), asc(comments.createdAt)];

  const rootRows = await commentSelect(db, currentUserId)
    .where(and(...rootConditions))
    .orderBy(...rootOrder)
    .limit(opts.limit + 1)
    .offset(opts.offset);

  const hasMore = rootRows.length > opts.limit;
  const pagedRootRows = rootRows.slice(0, opts.limit);

  const acceptedRows = acceptedId
    ? await commentSelect(db, currentUserId)
        .where(and(eq(comments.id, acceptedId), commentVisibilityFilter(currentUserId)))
        .limit(1)
    : [];

  const rootDetails = new Map<string, CommentDetail>();
  const rootsInOrder: CommentDetail[] = [];
  for (const { comment: commentRow, author, viewerHasLiked } of pagedRootRows) {
    const detail = await toCommentDetail(commentRow, author, currentUserId, viewerHasLiked);
    detail.replies = [];
    rootDetails.set(detail.id, detail);
    rootsInOrder.push(detail);
  }

  let acceptedComment: CommentDetail | null = null;
  if (acceptedRows[0]) {
    const { comment: commentRow, author, viewerHasLiked } = acceptedRows[0];
    acceptedComment = await toCommentDetail(commentRow, author, currentUserId, viewerHasLiked);
    acceptedComment.replies = [];
    rootDetails.set(acceptedComment.id, acceptedComment);
  }

  const parentIds = [...rootDetails.keys()];
  if (parentIds.length > 0) {
    // Replies stay chronological under their parent, regardless of root sort.
    const replyRows = await commentSelect(db, currentUserId)
      .where(
        and(
          inArray(comments.parentCommentId, parentIds),
          commentVisibilityFilter(currentUserId)
        )
      )
      .orderBy(asc(comments.createdAt));

    for (const { comment: commentRow, author, viewerHasLiked } of replyRows) {
      const detail = await toCommentDetail(commentRow, author, currentUserId, viewerHasLiked);
      const parent = detail.parentCommentId ? rootDetails.get(detail.parentCommentId) : undefined;
      parent?.replies?.push(detail);
    }
  }

  return { comments: rootsInOrder, acceptedComment, hasMore };
}

export async function createComment(
  db: DrizzleClient,
  postId: string,
  input: CreateCommentRequest,
  authorId: string
): Promise<CommentDetail> {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  });
  if (!post) throw new Error('Post not found');

  const canComment =
    (await db.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.groupId, post.groupId),
        eq(groupMemberships.userId, authorId)
      ),
    })) ||
    (await db.query.users.findFirst({
      where: eq(users.id, authorId),
      columns: { role: true },
    }))?.role === 'admin';

  if (!canComment) throw new Error('Forbidden');

  if (input.parentCommentId) {
    const parent = await db.query.comments.findFirst({
      where: eq(comments.id, input.parentCommentId),
    });
    if (!parent || parent.postId !== postId) throw new Error('Invalid parent comment');
  }

  const contentPlain = htmlToText(input.content);

  const comment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(comments)
      .values({
        postId,
        authorId,
        parentCommentId: input.parentCommentId ?? null,
        content: input.content,
        contentPlain,
      })
      .returning();

    if (!created) throw new Error('Failed to create comment');

    await autoFlagIfWatched(tx, created.contentPlain, 'comment', created.id);

    return created;
  });

  await awardPoints(db, {
    userId: authorId,
    eventType: 'comment_created',
    points: POINT_WEIGHTS.comment_created,
    sourceId: comment.id,
    groupId: post.groupId,
    context: { postId },
  });

  await advanceStreak(db, authorId);

  if (post.authorId !== authorId) {
    await insertNotification(db, {
      userId: post.authorId,
      actorId: authorId,
      type: 'comment',
      payload: { postId, commentId: comment.id },
    });
  }

  const author = await db.query.users.findFirst({
    where: eq(users.id, authorId),
  });
  if (!author) throw new Error('Author not found');
  return toCommentDetail(comment, author, authorId);
}

export async function updateComment(
  db: DrizzleClient,
  id: string,
  input: PatchCommentRequest,
  currentUserId: string
): Promise<CommentDetail> {
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
  });
  if (!comment) throw new Error('Comment not found');

  const user = await db.query.users.findFirst({
    where: eq(users.id, currentUserId),
    columns: { role: true },
  });
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, comment.postId),
    columns: { groupId: true },
  });
  if (!post) throw new Error('Post not found');

  const isGroupMod =
    input.status !== undefined &&
    input.content === undefined &&
    (await db.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.groupId, post.groupId),
        eq(groupMemberships.userId, currentUserId),
        inArray(groupMemberships.role, ['admin', 'moderator'])
      ),
    }));
  const canEdit =
    comment.authorId === currentUserId ||
    isAdminOrModerator(user?.role ?? '') ||
    Boolean(isGroupMod);
  if (!canEdit) throw new Error('Forbidden');

  const update: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (input.content !== undefined) {
    update.content = input.content;
    update.contentPlain = htmlToText(input.content);
  }
  if (input.status !== undefined) update.status = input.status;

  const [updated] = await db
    .update(comments)
    .set(update)
    .where(eq(comments.id, id))
    .returning();

  if (!updated) throw new Error('Failed to update comment');

  const author = await db.query.users.findFirst({
    where: eq(users.id, updated.authorId),
  });
  if (!author) throw new Error('Author not found');
  return toCommentDetail(updated, author, currentUserId);
}

export async function deleteComment(
  db: DrizzleClient,
  id: string,
  currentUserId: string
): Promise<CommentDetail> {
  return updateComment(db, id, { status: 'deleted' }, currentUserId);
}

export async function acceptSolution(
  db: DrizzleClient,
  postId: string,
  input: AcceptSolutionRequest,
  currentUserId: string
): Promise<Comment> {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  });
  if (!post) throw new Error('Post not found');

  const user = await db.query.users.findFirst({
    where: eq(users.id, currentUserId),
    columns: { role: true },
  });
  const isGroupMod = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, post.groupId),
      eq(groupMemberships.userId, currentUserId),
      inArray(groupMemberships.role, ['admin', 'moderator'])
    ),
  });
  const canAccept = post.authorId === currentUserId || isAdminOrModerator(user?.role ?? '') || Boolean(isGroupMod);
  if (!canAccept) throw new Error('Forbidden');

  const comment = await db.query.comments.findFirst({
    where: and(eq(comments.id, input.commentId), eq(comments.postId, postId)),
  });
  if (!comment) throw new Error('Comment not found on this post');
  if (comment.status !== 'published') throw new Error('Only published comments can be accepted as a solution');

  if (post.acceptedCommentId === input.commentId) {
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      parentCommentId: comment.parentCommentId,
      content: comment.content,
      contentPlain: comment.contentPlain,
      upvotes: comment.upvotes,
      status: comment.status,
      createdAt: toISO(comment.createdAt),
      updatedAt: toISO(comment.updatedAt),
    };
  }

  const [updatedPost] = await db
    .update(posts)
    .set({ acceptedCommentId: input.commentId, updatedAt: new Date() })
    .where(eq(posts.id, postId))
    .returning();

  if (!updatedPost) throw new Error('Failed to accept solution');

  await awardPoints(db, {
    userId: comment.authorId,
    eventType: 'solution_accepted',
    points: POINT_WEIGHTS.solution_accepted,
    sourceId: comment.id,
    groupId: post.groupId,
    context: { postId },
  });

  await insertNotification(db, {
    userId: comment.authorId,
    actorId: currentUserId,
    type: 'solution',
    payload: { postId, commentId: comment.id },
  });

  // T8.4: notify the solver by email. Fire-and-forget — sendTransactional
  // reads users.preferences.emailNotifications (default on) and never throws,
  // so a Loops outage can't break solution acceptance.
  await sendTransactional('solution_accepted', {
    db,
    userId: comment.authorId,
    dataVariables: {
      postTitle: post.title,
      postUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/p/${post.id}`,
    },
  });

  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    parentCommentId: comment.parentCommentId,
    content: comment.content,
    contentPlain: comment.contentPlain,
    upvotes: comment.upvotes,
    status: comment.status,
    createdAt: toISO(comment.createdAt),
    updatedAt: toISO(comment.updatedAt),
  };
}
