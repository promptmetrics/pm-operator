import { eq, and, desc, count, inArray, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  FollowResponse,
  FollowCounts,
  FollowListItem,
  FollowListQuery,
  NotificationPayload,
} from '@pm-operator/api';
import { NotificationType } from '@pm-operator/api';
import { toPublicUserProfile } from './shared';
import { insertNotification } from './notifications';

// Resolve a profile slug to the user row with the fields follow/unfollow + the
// public counts need. Case-insensitive lookup (matches getUserProfile).
export async function getFollowTarget(
  db: DrizzleClient,
  slug: string
): Promise<{ id: string; followerCount: number; followingCount: number } | null> {
  const user = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
    columns: {
      id: true,
      followerCount: true,
      followingCount: true,
    },
  });
  if (!user) return null;
  return { id: user.id, followerCount: user.followerCount, followingCount: user.followingCount };
}

// Follow a user. Idempotent: onConflictDoNothing means a repeat follow is a
// no-op (no duplicate notification). Returns the post-action counts.
export async function followUser(
  db: DrizzleClient,
  followerId: string,
  followeeId: string
): Promise<FollowResponse> {
  const [inserted] = await db
    .insert(schema.follows)
    .values({ followerId, followeeId })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    const [follower, followee] = await Promise.all([
      db.query.users.findFirst({
        where: eq(schema.users.id, followerId),
        columns: { id: true, username: true, userslug: true },
      }),
      db.query.users.findFirst({
        where: eq(schema.users.id, followeeId),
        columns: { followerCount: true },
      }),
    ]);
    const payload: NotificationPayload = {
      actorId: followerId,
      actorSlug: follower?.userslug,
      actorUsername: follower?.username,
    };
    await insertNotification(db, {
      userId: followeeId,
      actorId: followerId,
      type: NotificationType.NEW_FOLLOWER,
      payload,
    });
    const following = await db.query.users.findFirst({
      where: eq(schema.users.id, followerId),
      columns: { followingCount: true },
    });
    return {
      following: true,
      followerCount: followee?.followerCount ?? 0,
      followingCount: following?.followingCount ?? 0,
    };
  }

  // Already following — return current counts.
  const [follower, followee] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, followerId),
      columns: { followingCount: true },
    }),
    db.query.users.findFirst({
      where: eq(schema.users.id, followeeId),
      columns: { followerCount: true },
    }),
  ]);
  return {
    following: true,
    followerCount: followee?.followerCount ?? 0,
    followingCount: follower?.followingCount ?? 0,
  };
}

// Unfollow a user. Idempotent: deleting a non-existent row is a no-op.
export async function unfollowUser(
  db: DrizzleClient,
  followerId: string,
  followeeId: string
): Promise<FollowResponse> {
  await db
    .delete(schema.follows)
    .where(
      and(
        eq(schema.follows.followerId, followerId),
        eq(schema.follows.followeeId, followeeId)
      )
    );

  const [follower, followee] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, followerId),
      columns: { followingCount: true },
    }),
    db.query.users.findFirst({
      where: eq(schema.users.id, followeeId),
      columns: { followerCount: true },
    }),
  ]);
  return {
    following: false,
    followerCount: followee?.followerCount ?? 0,
    followingCount: follower?.followingCount ?? 0,
  };
}

// Public counts + whether the viewer follows the subject (profile banner, T9.3).
export async function getFollowCounts(
  db: DrizzleClient,
  targetUserId: string,
  viewerId: string | null
): Promise<FollowCounts | null> {
  const [target, existing] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, targetUserId),
      columns: { followerCount: true, followingCount: true },
    }),
    viewerId
      ? db.query.follows.findFirst({
          where: and(
            eq(schema.follows.followerId, viewerId),
            eq(schema.follows.followeeId, targetUserId)
          ),
        })
      : Promise.resolve(null),
  ]);
  if (!target) return null;
  return {
    followerCount: target.followerCount,
    followingCount: target.followingCount,
    isFollowing: !!existing,
  };
}

// Single-query follow-state check for the profile page's Follow button (T9.3).
// Folded into the profile page's existing 2-wide wave as a 3rd concurrent query
// (stays within the ≤3 pool budget).
export async function checkIsFollowing(
  db: DrizzleClient,
  viewerId: string,
  targetUserId: string
): Promise<boolean> {
  const existing = await db.query.follows.findFirst({
    where: and(
      eq(schema.follows.followerId, viewerId),
      eq(schema.follows.followeeId, targetUserId)
    ),
  });
  return !!existing;
}

// acceptedSolutions per user for a page of ids (single groupBy).
async function acceptedSolutionsByUser(
  db: DrizzleClient,
  userIds: string[]
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: schema.comments.authorId, value: count() })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
    .where(inArray(schema.comments.authorId, userIds))
    .groupBy(schema.comments.authorId);
  return new Map(rows.map((r) => [r.userId, Number(r.value)]));
}

// List the users who follow `targetUserId` (newest first). Edge lists are
// self-only (decision 2A); the route enforces viewer === target.
export async function listFollowers(
  db: DrizzleClient,
  targetUserId: string,
  query: FollowListQuery
): Promise<{ items: FollowListItem[]; hasMore: boolean }> {
  const limit = query.limit;
  const offset = (query.page - 1) * limit;
  const rows = await db.query.follows.findMany({
    where: eq(schema.follows.followeeId, targetUserId),
    orderBy: [desc(schema.follows.createdAt)],
    limit: limit + 1,
    offset,
  });
  const hasMore = rows.length > limit;
  const followerIds = rows.slice(0, limit).map((r) => r.followerId);
  return resolveListItems(db, followerIds, hasMore);
}

// List the users `targetUserId` follows (newest first).
export async function listFollowing(
  db: DrizzleClient,
  targetUserId: string,
  query: FollowListQuery
): Promise<{ items: FollowListItem[]; hasMore: boolean }> {
  const limit = query.limit;
  const offset = (query.page - 1) * limit;
  const rows = await db.query.follows.findMany({
    where: eq(schema.follows.followerId, targetUserId),
    orderBy: [desc(schema.follows.createdAt)],
    limit: limit + 1,
    offset,
  });
  const hasMore = rows.length > limit;
  const followeeIds = rows.slice(0, limit).map((r) => r.followeeId);
  return resolveListItems(db, followeeIds, hasMore);
}

// 2-wide wave: user profiles + acceptedSolutions, then map to PublicUserProfile
// (avatar URL resolution is a Storage call, not a DB query — same pattern as
// the mention-search route). Preserves the follows ordering.
async function resolveListItems(
  db: DrizzleClient,
  orderedIds: string[],
  hasMore: boolean
): Promise<{ items: FollowListItem[]; hasMore: boolean }> {
  if (orderedIds.length === 0) return { items: [], hasMore };
  const [userRows, solutions] = await Promise.all([
    db.query.users.findMany({
      where: inArray(schema.users.id, orderedIds),
    }),
    acceptedSolutionsByUser(db, orderedIds),
  ]);
  const byId = new Map(userRows.map((u) => [u.id, u]));
  const items = await Promise.all(
    orderedIds.map(async (id) => {
      const u = byId.get(id);
      if (!u) return null;
      return toPublicUserProfile({ ...u, acceptedSolutions: solutions.get(id) ?? 0 });
    })
  );
  return { items: items.filter((i): i is FollowListItem => i !== null), hasMore };
}