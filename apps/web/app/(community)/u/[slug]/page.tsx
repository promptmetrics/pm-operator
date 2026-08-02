import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getUserProfile, listUserCircleContributions, getUserStreakWeek } from '@/lib/services/users';
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

  // Two bounded waves instead of one wide Promise.all: getUserBadges fans out
  // its own concurrent queries, and stacking everything starves the small
  // per-instance DB pool instead of queueing (same note in the profile route).
  const [posts, solutions, comments, bookmarks] = await Promise.all([
    listPostsByAuthor(db, user.id, currentUserId, 20),
    listAcceptedSolutionsByAuthor(db, user.id, currentUserId, 20),
    listCommentsByAuthor(db, user.id, currentUserId, 20),
    isOwnProfile && currentUserId
      ? listBookmarkedPosts(db, currentUserId, { limit: 20 }).then((r) => r.posts)
      : Promise.resolve(undefined),
  ]);
  const [circles, streak] = await Promise.all([
    listUserCircleContributions(db, user.id),
    getUserStreakWeek(db, user.id),
  ]);
  const badges = await getUserBadges(db, user.id);

  return (
    <ProfileTabs
      user={user}
      currentUserId={currentUserId}
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
