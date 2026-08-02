import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getUserProfile, listUserCircleContributions, getUserStreakWeek } from '@/lib/services/users';
import { checkIsFollowing } from '@/lib/services/follows';
import {
  listPostsByAuthor,
  listAcceptedSolutionsByAuthor,
  listCommentsByAuthor,
} from '@/lib/services/community';
import { getUserBadges } from '@/lib/services/badges';
import { listBookmarkedPosts } from '@/lib/services/bookmarks';
import { ProfileTabs } from '../../components/ProfileTabs';

export default async function UserRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const user = await getUserProfile(db, slug);
  if (!user) notFound();

  const isOwnProfile = currentUserId === user.id;

  // Bounded waves of ≤3 concurrent queries (pool-starvation rule).
  // listUserCircleContributions fans out 2 queries internally, so it can share
  // a wave with at most one other single query — getUserStreakWeek (1).
  // checkIsFollowing (1) therefore runs in its own trailing step, not in the
  // same wave (2+1+1 would be 4 on the non-self viewer path). bookmarks is
  // self-only and runs in its own step; getUserBadges fans out, so it stays
  // last and alone (same note as the circle route).
  const [posts, solutions, comments] = await Promise.all([
    listPostsByAuthor(db, user.id, currentUserId, 20),
    listAcceptedSolutionsByAuthor(db, user.id, currentUserId, 20),
    listCommentsByAuthor(db, user.id, currentUserId, 20),
  ]);
  const [circles, streak] = await Promise.all([
    listUserCircleContributions(db, user.id),
    getUserStreakWeek(db, user.id),
  ]);
  const isFollowing =
    currentUserId && !isOwnProfile
      ? await checkIsFollowing(db, currentUserId, user.id)
      : false;
  const bookmarks =
    isOwnProfile && currentUserId
      ? (await listBookmarkedPosts(db, currentUserId, { limit: 20 })).posts
      : undefined;
  const badges = await getUserBadges(db, user.id);

  return (
    <ProfileTabs
      user={user}
      currentUserId={currentUserId}
      isFollowing={isFollowing}
      posts={posts}
      solutions={solutions}
      comments={comments}
      badges={badges}
      bookmarks={bookmarks}
      circles={circles}
      streak={streak}
    />
  );
}
