import { eq, and, or, sql, desc, count, inArray, type SQL } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Group,
  PostListItem,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardType,
  CommentDetail,
  PublicUserProfile,
  UserRole,
} from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { getAvatarReadUrl } from '../storage';
import { toISO, toNumber, isAdminOrModerator } from './shared';

function postVisibilityFilter(currentUserId: string | undefined) {
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

async function toPostListItem(
  row: {
    post: typeof schema.posts.$inferSelect;
    group: typeof schema.groups.$inferSelect;
    author: typeof schema.users.$inferSelect;
    acceptedSolutions: string | number | null;
  }
): Promise<PostListItem> {
  return {
    id: row.post.id,
    title: row.post.title,
    type: row.post.type,
    status: row.post.status,
    isSolved: row.post.acceptedCommentId !== null,
    group: { slug: row.group.slug, name: row.group.name },
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
  };
}

export async function getWritableGroups(
  db: DrizzleClient,
  userId: string
): Promise<Group[]> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });

  if (user?.role === 'admin') {
    const rows = await db.query.groups.findMany({ orderBy: [schema.groups.name] });
    return rows.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      description: g.description,
      color: g.color,
      visibility: g.visibility,
      requiredTierId: g.requiredTierId,
      memberCount: g.memberCount,
      createdBy: g.createdBy,
      createdAt: toISO(g.createdAt),
      updatedAt: toISO(g.updatedAt),
    }));
  }

  const rows = await db
    .select({ group: schema.groups, membership: schema.groupMemberships })
    .from(schema.groupMemberships)
    .innerJoin(schema.groups, eq(schema.groupMemberships.groupId, schema.groups.id))
    .where(eq(schema.groupMemberships.userId, userId))
    .orderBy(schema.groups.name);

  return rows.map((r) => ({
    id: r.group.id,
    slug: r.group.slug,
    name: r.group.name,
    description: r.group.description,
    color: r.group.color,
    visibility: r.group.visibility,
    requiredTierId: r.group.requiredTierId,
    memberCount: r.group.memberCount,
    createdBy: r.group.createdBy,
    createdAt: toISO(r.group.createdAt),
    updatedAt: toISO(r.group.updatedAt),
  }));
}

export async function getUserMembershipGroups(
  db: DrizzleClient,
  userId: string
): Promise<{ group: Group; role: UserRole }[]> {
  const rows = await db
    .select({ group: schema.groups, membership: schema.groupMemberships })
    .from(schema.groupMemberships)
    .innerJoin(schema.groups, eq(schema.groupMemberships.groupId, schema.groups.id))
    .where(eq(schema.groupMemberships.userId, userId))
    .orderBy(schema.groups.name);

  return rows.map((r) => ({
    group: {
      id: r.group.id,
      slug: r.group.slug,
      name: r.group.name,
      description: r.group.description,
      color: r.group.color,
      visibility: r.group.visibility,
      requiredTierId: r.group.requiredTierId,
      memberCount: r.group.memberCount,
      createdBy: r.group.createdBy,
      createdAt: toISO(r.group.createdAt),
      updatedAt: toISO(r.group.updatedAt),
    },
    role: r.membership.role as UserRole,
  }));
}

export async function listPinnedPosts(
  db: DrizzleClient,
  groupId: string,
  currentUserId?: string
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
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(
      and(
        eq(schema.posts.groupId, groupId),
        eq(schema.posts.isPinned, true),
        postVisibilityFilter(currentUserId)
      )
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(10);

  return Promise.all(rows.map(toPostListItem));
}

export type LeaderboardWindow = 'all_time' | 'weekly' | 'monthly';

// Matches the period_start windows written by the apply_point_event trigger
// (migration 0010): all_time rows use the 1970-01-01 sentinel.
function currentPeriodStartSql(period: LeaderboardPeriod) {
  switch (period) {
    case 'weekly':
      return sql`date_trunc('week', now())::date`;
    case 'monthly':
      return sql`date_trunc('month', now())::date`;
    case 'quarterly':
      return sql`date_trunc('quarter', now())::date`;
    default:
      return sql`'1970-01-01'::date`;
  }
}

// Ranking variants: points = windowed score; solutions = accepted-solutions
// count, ties by score; streaks = users.streak_days, ties by score.
function leaderboardOrderSql(type: LeaderboardType) {
  switch (type) {
    case 'solutions':
      return sql`coalesce(as_count.count, 0) desc, ${schema.userScores.score} desc`;
    case 'streaks':
      return sql`${schema.users.streakDays} desc, ${schema.userScores.score} desc`;
    default:
      return sql`${schema.userScores.score} desc`;
  }
}

interface LeaderboardRow {
  rank: number | string;
  userslug: string;
  username: string;
  score: number | string;
  accepted_solutions: number | string;
  role: string;
  streak_days: number | string;
  reputation_score: number | string;
}

function toLeaderboardEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    rank: Number(row.rank),
    userslug: row.userslug,
    username: row.username,
    score: toNumber(row.score),
    acceptedSolutions: Number(row.accepted_solutions ?? 0),
    level: levelForScore(toNumber(row.reputation_score)).level,
    streakDays: Number(row.streak_days ?? 0),
    role: row.role,
  };
}

// Ranked board CTE shared by list + viewer queries. solutions/streaks boards
// are global-only and period-independent: they rank over the all_time window
// so the score column always shows the all-time score.
function leaderboardBoardSql(
  groupId: string,
  period: LeaderboardPeriod,
  type: LeaderboardType
) {
  const window: LeaderboardPeriod = type === 'points' ? period : 'all_time';
  const boardGroupId = type === 'points' ? groupId : schema.GLOBAL_GROUP_ID;
  const order = leaderboardOrderSql(type);
  return sql`
    with as_count as (
      select ${schema.comments.authorId} as user_id, count(*)::int as count
      from ${schema.comments}
      inner join ${schema.posts} on ${schema.posts.acceptedCommentId} = ${schema.comments.id}
      group by ${schema.comments.authorId}
    ),
    board as (
      select
        rank() over (order by ${order}) as rank,
        ${schema.users.id} as user_id,
        ${schema.users.userslug} as userslug,
        ${schema.users.username} as username,
        ${schema.userScores.score} as score,
        coalesce(as_count.count, 0) as accepted_solutions,
        ${schema.users.role} as role,
        ${schema.users.streakDays} as streak_days,
        ${schema.users.reputationScore} as reputation_score
      from ${schema.userScores}
      inner join ${schema.users} on ${schema.users.id} = ${schema.userScores.userId}
      left join as_count on as_count.user_id = ${schema.users.id}
      where ${schema.userScores.groupId} = ${boardGroupId}
        and ${schema.userScores.period} = ${window}
        and ${schema.userScores.periodStart} = ${currentPeriodStartSql(window)}
    )
  `;
}

export interface LeaderboardOptions {
  groupId?: string;
  period?: LeaderboardPeriod;
  type?: LeaderboardType;
}

export async function listLeaderboard(
  db: DrizzleClient,
  opts: LeaderboardOptions & { limit: number; offset?: number }
): Promise<LeaderboardEntry[]> {
  const {
    groupId = schema.GLOBAL_GROUP_ID,
    period = 'all_time',
    type = 'points',
    limit,
    offset = 0,
  } = opts;
  const rows = (await db.execute(sql`
    ${leaderboardBoardSql(groupId, period, type)}
    select rank, userslug, username, score, accepted_solutions, role, streak_days, reputation_score
    from board
    order by rank, userslug
    limit ${limit}
    offset ${offset}
  `)) as unknown as LeaderboardRow[];
  return rows.map(toLeaderboardEntry);
}

// The session user's row on the same board: rank() over the full board is
// count of users strictly ahead + 1. Returns null when the user has no score
// row in the board's window.
export async function getLeaderboardViewer(
  db: DrizzleClient,
  userId: string,
  opts: LeaderboardOptions = {}
): Promise<LeaderboardEntry | null> {
  const {
    groupId = schema.GLOBAL_GROUP_ID,
    period = 'all_time',
    type = 'points',
  } = opts;
  const rows = (await db.execute(sql`
    ${leaderboardBoardSql(groupId, period, type)}
    select rank, userslug, username, score, accepted_solutions, role, streak_days, reputation_score
    from board
    where user_id = ${userId}
    limit 1
  `)) as unknown as LeaderboardRow[];
  return rows[0] ? toLeaderboardEntry(rows[0]) : null;
}

export async function listGlobalLeaderboard(
  db: DrizzleClient,
  period: LeaderboardWindow,
  limit = 5
): Promise<LeaderboardEntry[]> {
  return listLeaderboard(db, { groupId: schema.GLOBAL_GROUP_ID, period, limit });
}

export async function listGroupLeaderboard(
  db: DrizzleClient,
  groupId: string,
  period: LeaderboardWindow,
  limit = 5
): Promise<LeaderboardEntry[]> {
  return listLeaderboard(db, { groupId, period, limit });
}

export async function listPostsByAuthor(
  db: DrizzleClient,
  authorId: string,
  currentUserId: string | undefined,
  limit = 20
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
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(and(eq(schema.posts.authorId, authorId), postVisibilityFilter(currentUserId)))
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit);

  return Promise.all(rows.map(toPostListItem));
}

export interface AcceptedSolutionItem extends CommentDetail {
  post: {
    id: string;
    title: string;
    slug: string;
    group: { slug: string; name: string };
  };
}

export async function listAcceptedSolutionsByAuthor(
  db: DrizzleClient,
  authorId: string,
  currentUserId: string | undefined,
  limit = 20
): Promise<AcceptedSolutionItem[]> {
  const rows = await db
    .select({
      comment: schema.comments,
      post: schema.posts,
      group: schema.groups,
      author: schema.users,
    })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .where(
      and(
        eq(schema.comments.authorId, authorId),
        postVisibilityFilter(currentUserId)
      )
    )
    .orderBy(desc(schema.posts.updatedAt))
    .limit(limit);

  const items: AcceptedSolutionItem[] = [];
  for (const { comment, post, group, author } of rows) {
    items.push({
      id: comment.id,
      postId: post.id,
      authorId: comment.authorId,
      parentCommentId: comment.parentCommentId,
      content:
        comment.status === 'hidden' &&
        comment.authorId !== currentUserId &&
        !isAdminOrModerator(author.role)
          ? ''
          : comment.content,
      contentPlain:
        comment.status === 'hidden' &&
        comment.authorId !== currentUserId &&
        !isAdminOrModerator(author.role)
          ? ''
          : comment.contentPlain,
      upvotes: comment.upvotes,
      status: comment.status,
      createdAt: toISO(comment.createdAt),
      updatedAt: toISO(comment.updatedAt),
      author: {
        id: author.id,
        username: author.username,
        userslug: author.userslug,
        fullName: author.fullName,
        pictureUrl: await getAvatarReadUrl(author.pictureUrl),
        role: author.role as PublicUserProfile['role'],
        reputationScore: toNumber(author.reputationScore),
        streakDays: author.streakDays,
        acceptedSolutions: 0,
        level: levelForScore(toNumber(author.reputationScore)).level,
      },
      post: {
        id: post.id,
        title: post.title,
        slug: post.id,
        group: { slug: group.slug, name: group.name },
      },
    });
  }
  return items;
}

export async function listCommentsByAuthor(
  db: DrizzleClient,
  authorId: string,
  currentUserId: string | undefined,
  limit = 20
): Promise<CommentDetail[]> {
  const rows = await db
    .select({ comment: schema.comments, author: schema.users, post: schema.posts, group: schema.groups })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(() => {
      const visibilityConditions: SQL[] = [
        and(
          sql`${schema.groups.visibility} = 'public'`,
          sql`${schema.comments.status} <> 'hidden'`
        )!,
      ];
      if (currentUserId) {
        visibilityConditions.push(eq(schema.comments.authorId, currentUserId));
        visibilityConditions.push(
          sql`exists (
            select 1 from ${schema.users}
            where ${schema.users.id} = ${currentUserId} and ${schema.users.role} = 'admin'
          )`
        );
        visibilityConditions.push(
          sql`exists (
            select 1 from ${schema.groupMemberships}
            where ${schema.groupMemberships.groupId} = ${schema.groups.id}
              and ${schema.groupMemberships.userId} = ${currentUserId}
              and ${schema.groupMemberships.role} in ('admin', 'moderator')
          )`
        );
        visibilityConditions.push(
          sql`exists (
            select 1 from ${schema.groupMemberships}
            where ${schema.groupMemberships.groupId} = ${schema.groups.id}
              and ${schema.groupMemberships.userId} = ${currentUserId}
          )`
        );
      }
      return and(
        eq(schema.comments.authorId, authorId),
        sql`${schema.comments.status} <> 'deleted'`,
        or(...visibilityConditions)
      );
    })
    .orderBy(desc(schema.comments.createdAt))
    .limit(limit);

  const out: CommentDetail[] = [];
  for (const { comment, author } of rows) {
    out.push({
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      parentCommentId: comment.parentCommentId,
      content:
        comment.status === 'hidden' &&
        comment.authorId !== currentUserId &&
        !isAdminOrModerator(author.role)
          ? ''
          : comment.content,
      contentPlain:
        comment.status === 'hidden' &&
        comment.authorId !== currentUserId &&
        !isAdminOrModerator(author.role)
          ? ''
          : comment.contentPlain,
      upvotes: comment.upvotes,
      status: comment.status,
      createdAt: toISO(comment.createdAt),
      updatedAt: toISO(comment.updatedAt),
      author: {
        id: author.id,
        username: author.username,
        userslug: author.userslug,
        fullName: author.fullName,
        pictureUrl: await getAvatarReadUrl(author.pictureUrl),
        role: author.role as PublicUserProfile['role'],
        reputationScore: toNumber(author.reputationScore),
        streakDays: author.streakDays,
        acceptedSolutions: 0,
        level: levelForScore(toNumber(author.reputationScore)).level,
      },
    });
  }
  return out;
}
