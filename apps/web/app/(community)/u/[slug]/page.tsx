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
import { ProfileTabs } from '../../components/ProfileTabs';

export default async function UserRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const user = await getUserProfile(db, slug);
  if (!user) notFound();

  const [posts, solutions, comments, badges] = await Promise.all([
    listPostsByAuthor(db, user.id, currentUserId, 20),
    listAcceptedSolutionsByAuthor(db, user.id, currentUserId, 20),
    listCommentsByAuthor(db, user.id, currentUserId, 20),
    getUserBadges(db, user.id),
  ]);

  return (
    <ProfileTabs
      user={user}
      currentUserId={currentUserId}
      posts={posts}
      solutions={solutions}
      comments={comments}
      badges={badges}
    />
  );
}
