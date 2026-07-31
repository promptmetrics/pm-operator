import { eq, and, or, sql, desc, inArray } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import { comments, posts, users, groups, groupMemberships } from '@pm-operator/db';
import type {
  Comment,
  CommentDetail,
  CreateCommentRequest,
  PatchCommentRequest,
  AcceptSolutionRequest,
} from '@pm-operator/api';
import { getAvatarReadUrl } from '../storage';
import { toISO, toNumber, isAdminOrModerator } from './shared';
import { insertNotification } from './notifications';
import { awardPoints, trackDailyStat } from './points';

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

async function toCommentDetail(
  row: typeof comments.$inferSelect,
  author: typeof users.$inferSelect,
  currentUserId?: string
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
    },
  };
}

export async function listCommentsForPost(
  db: DrizzleClient,
  postId: string,
  currentUserId?: string
): Promise<CommentDetail[]> {
  const rows = await db
    .select()
    .from(comments)
    .innerJoin(posts, eq(comments.postId, posts.id))
    .innerJoin(groups, eq(posts.groupId, groups.id))
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(
      and(
        eq(comments.postId, postId),
        commentVisibilityFilter(currentUserId)
      )
    )
    .orderBy(comments.createdAt);

  const byId = new Map<string, CommentDetail>();
  const roots: CommentDetail[] = [];

  for (const { comments: commentRow, users: author } of rows) {
    const detail = await toCommentDetail(commentRow, author, currentUserId);
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

  const [comment] = await db
    .insert(comments)
    .values({
      postId,
      authorId,
      parentCommentId: input.parentCommentId ?? null,
      content: input.content,
      contentPlain: '', // caller should strip HTML upstream
    })
    .returning();

  if (!comment) throw new Error('Failed to create comment');

  await awardPoints(db, {
    userId: authorId,
    eventType: 'comment_created',
    points: 2,
    sourceId: comment.id,
    groupId: post.groupId,
    context: { postId },
  });

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
  const canEdit = comment.authorId === currentUserId || isAdminOrModerator(user?.role ?? '');
  if (!canEdit) throw new Error('Forbidden');

  const update: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (input.content !== undefined) {
    update.content = input.content;
    update.contentPlain = '';
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

  const [updatedPost] = await db
    .update(posts)
    .set({ acceptedCommentId: input.commentId, updatedAt: new Date() })
    .where(eq(posts.id, postId))
    .returning();

  if (!updatedPost) throw new Error('Failed to accept solution');

  await awardPoints(db, {
    userId: comment.authorId,
    eventType: 'solution_accepted',
    points: 25,
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
