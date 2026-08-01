import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getUserProfile } from '@/lib/services/users';
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

  const [posts, solutions, comments, badges, bookmarks] = await Promise.all([
    listPostsByAuthor(db, user.id, currentUserId, 20),
    listAcceptedSolutionsByAuthor(db, user.id, currentUserId, 20),
    listCommentsByAuthor(db, user.id, currentUserId, 20),
    getUserBadges(db, user.id),
    isOwnProfile && currentUserId
      ? listBookmarkedPosts(db, currentUserId, { limit: 20 }).then((r) => r.posts)
      : Promise.resolve(undefined),
  ]);

  return (
    <ProfileTabs
      user={user}
      currentUserId={currentUserId}
      posts={posts}
      solutions={solutions}
      comments={comments}
      badges={badges}
      bookmarks={bookmarks}
    />
  );
}
