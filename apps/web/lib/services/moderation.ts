import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  FlagQueueItem,
  Flag,
  ResolveFlagRequest,
  FlagQuery,
} from '@pm-operator/api';
import { isAdminOrModerator, toISO } from './shared';
import { insertNotification } from './notifications';

export async function isGlobalModerator(
  db: DrizzleClient,
  userId: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  return isAdminOrModerator(user?.role ?? '');
}

export async function isGroupModerator(
  db: DrizzleClient,
  userId: string,
  groupId: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  if (user?.role === 'admin' || user?.role === 'moderator') return true;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, groupId),
      eq(schema.groupMemberships.userId, userId)
    ),
    columns: { role: true },
  });
  return membership?.role === 'admin' || membership?.role === 'moderator';
}

export async function canModerateFlag(
  db: DrizzleClient,
  userId: string,
  flag: typeof schema.flags.$inferSelect
): Promise<boolean> {
  if (await isGlobalModerator(db, userId)) return true;

  // Resolve target group for group-level moderators.
  if (flag.targetType === 'post') {
    const post = await db.query.posts.findFirst({
      where: eq(schema.posts.id, flag.targetId),
      columns: { groupId: true },
    });
    if (post) return isGroupModerator(db, userId, post.groupId);
  }

  if (flag.targetType === 'comment') {
    const comment = await db.query.comments.findFirst({
      where: eq(schema.comments.id, flag.targetId),
      columns: { postId: true },
    });
    if (comment) {
      const post = await db.query.posts.findFirst({
        where: eq(schema.posts.id, comment.postId),
        columns: { groupId: true },
      });
      if (post) return isGroupModerator(db, userId, post.groupId);
    }
  }

  return false;
}

export async function listModerationQueue(
  db: DrizzleClient,
  userId: string,
  query: FlagQuery
): Promise<{ items: FlagQueueItem[]; hasMore: boolean }> {
  if (!(await isGlobalModerator(db, userId))) {
    throw new Error('Forbidden');
  }

  const limit = query.limit;
  const offset = (query.page - 1) * limit;

  const rows = await db.query.flags.findMany({
    where: query.status ? eq(schema.flags.status, query.status) : undefined,
    orderBy: [desc(schema.flags.createdAt)],
    limit: limit + 1,
    offset,
  });

  const hasMore = rows.length > limit;
  const flagsSlice = hasMore ? rows.slice(0, limit) : rows;

  const items: FlagQueueItem[] = [];
  for (const flag of flagsSlice) {
    const target = await resolveFlagTarget(db, flag);
    items.push({
      id: flag.id,
      targetType: flag.targetType,
      targetId: flag.targetId,
      reporterId: flag.reporterId,
      reason: flag.reason,
      autoFlagged: flag.autoFlagged,
      status: flag.status,
      resolverId: flag.resolverId,
      resolutionNote: flag.resolutionNote,
      resolvedAt: flag.resolvedAt ? toISO(flag.resolvedAt) : null,
      createdAt: toISO(flag.createdAt),
      updatedAt: toISO(flag.updatedAt),
      target,
    });
  }

  return { items, hasMore };
}

async function resolveFlagTarget(
  db: DrizzleClient,
  flag: typeof schema.flags.$inferSelect
): Promise<FlagQueueItem['target']> {
  if (flag.targetType === 'post') {
    const row = await db
      .select({
        post: schema.posts,
        author: schema.users,
        group: schema.groups,
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(eq(schema.posts.id, flag.targetId))
      .then((rows) => rows[0]);

    if (!row) {
      return missingTarget(flag.targetType, flag.targetId);
    }

    return {
      id: row.post.id,
      type: 'post',
      title: row.post.title,
      content: row.post.content,
      author: {
        id: row.author.id,
        username: row.author.username,
        userslug: row.author.userslug,
      },
      group: {
        id: row.group.id,
        slug: row.group.slug,
        name: row.group.name,
      },
    };
  }

  const row = await db
    .select({
      comment: schema.comments,
      post: schema.posts,
      author: schema.users,
      group: schema.groups,
    })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
    .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(eq(schema.comments.id, flag.targetId))
    .then((rows) => rows[0]);

  if (!row) {
    return missingTarget(flag.targetType, flag.targetId);
  }

  return {
    id: row.comment.id,
    type: 'comment',
    title: row.post.title,
    content: row.comment.content,
    author: {
      id: row.author.id,
      username: row.author.username,
      userslug: row.author.userslug,
    },
    group: {
      id: row.group.id,
      slug: row.group.slug,
      name: row.group.name,
    },
  };
}

function missingTarget(
  type: 'post' | 'comment',
  id: string
): FlagQueueItem['target'] {
  return {
    id,
    type,
    title: null,
    content: null,
    author: { id: '', username: 'unknown', userslug: 'unknown' },
    group: { id: '', slug: 'unknown', name: 'Unknown' },
  };
}

export async function resolveFlag(
  db: DrizzleClient,
  id: string,
  input: ResolveFlagRequest,
  resolverId: string
): Promise<Flag> {
  const flag = await db.query.flags.findFirst({
    where: eq(schema.flags.id, id),
  });
  if (!flag) throw new Error('Flag not found');

  if (!(await canModerateFlag(db, resolverId, flag))) {
    throw new Error('Forbidden');
  }

  const [resolved] = await db
    .update(schema.flags)
    .set({
      status: input.status,
      resolverId,
      resolutionNote: input.resolutionNote ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.flags.id, id))
    .returning();

  if (!resolved) throw new Error('Failed to resolve flag');

  // Soft-delete/hide target content when resolved as action taken.
  if (input.status === 'resolved') {
    if (flag.targetType === 'post') {
      await db
        .update(schema.posts)
        .set({ status: 'hidden', updatedAt: new Date() })
        .where(eq(schema.posts.id, flag.targetId));
    } else if (flag.targetType === 'comment') {
      await db
        .update(schema.comments)
        .set({ status: 'hidden', updatedAt: new Date() })
        .where(eq(schema.comments.id, flag.targetId));
    }
  }

  if (flag.reporterId) {
    await insertNotification(db, {
      userId: flag.reporterId,
      actorId: resolverId,
      type: 'flag_resolved',
      payload: { flagId: resolved.id, reason: resolved.resolutionNote ?? undefined },
    });
  }

  return {
    id: resolved.id,
    targetType: resolved.targetType,
    targetId: resolved.targetId,
    reporterId: resolved.reporterId,
    reason: resolved.reason,
    autoFlagged: resolved.autoFlagged,
    status: resolved.status,
    resolverId: resolved.resolverId,
    resolutionNote: resolved.resolutionNote,
    resolvedAt: resolved.resolvedAt ? toISO(resolved.resolvedAt) : null,
    createdAt: toISO(resolved.createdAt),
    updatedAt: toISO(resolved.updatedAt),
  };
}

export async function deleteFlag(
  db: DrizzleClient,
  id: string,
  actorId: string
): Promise<void> {
  const flag = await db.query.flags.findFirst({
    where: eq(schema.flags.id, id),
  });
  if (!flag) throw new Error('Flag not found');

  if (!(await canModerateFlag(db, actorId, flag))) {
    throw new Error('Forbidden');
  }

  await db.delete(schema.flags).where(eq(schema.flags.id, id));
}
