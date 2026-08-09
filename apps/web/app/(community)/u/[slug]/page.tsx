import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import {
  getUserProfile,
  listUserCircleContributions,
  listUserCirclePoints,
  getUserStreakWeek,
} from '@/lib/services/users';
import { checkIsFollowing } from '@/lib/services/follows';
import {
  listPostsByAuthor,
  listAcceptedSolutionsByAuthor,
  listCommentsByAuthor,
} from '@/lib/services/community';
import { getUserBadges } from '@/lib/services/badges';
import { listBookmarkedPosts } from '@/lib/services/bookmarks';
import { ProfileTabs } from '../../components/ProfileTabs';
import type { PostListItem } from '@pm-operator/api';

// The community layout runs ONE rail query concurrently with this page on every
// navigation and the pool is 3 (the 2026-08-02 outage), so NO wave here may be
// wider than 2. That is why the fetches read as a staircase rather than one
// Promise.all: listUserCircleContributions and getUserBadges each fan out their
// own concurrent queries internally, so they only ever run alone.
type ViewerState = { isFollowing: boolean; bookmarks?: PostListItem[] };

// At most ONE query, whichever branch is taken: the follow probe is
// other-profile only and bookmarks are self-only, so these can never both run.
// Packaging them lets the viewer probe share a wave instead of costing a step.
async function loadViewerState(
  db: ReturnType<typeof createServiceDb>,
  targetUserId: string,
  currentUserId: string | undefined,
  isOwnProfile: boolean
): Promise<ViewerState> {
  if (!currentUserId) return { isFollowing: false };
  if (isOwnProfile) {
    const { posts } = await listBookmarkedPosts(db, currentUserId, { limit: 20 });
    return { isFollowing: false, bookmarks: posts };
  }
  return { isFollowing: await checkIsFollowing(db, currentUserId, targetUserId) };
}

export default async function UserRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  // Internally bounded: the user row, then a 2-wide count wave.
  const user = await getUserProfile(db, slug);
  if (!user) notFound();

  const isOwnProfile = currentUserId === user.id;

  const [posts, solutions] = await Promise.all([
    listPostsByAuthor(db, user.id, currentUserId, 20),
    listAcceptedSolutionsByAuthor(db, user.id, currentUserId, 20),
  ]);
  const [comments, streak] = await Promise.all([
    listCommentsByAuthor(db, user.id, currentUserId, 20),
    getUserStreakWeek(db, user.id),
  ]);
  // Track 5C's per-circle points breakdown is a single query, so it slots into
  // this wave beside the viewer probe rather than widening anything.
  const [circlePoints, viewer] = await Promise.all([
    listUserCirclePoints(db, user.id, 5),
    loadViewerState(db, user.id, currentUserId, isOwnProfile),
  ]);
  const circles = await listUserCircleContributions(db, user.id);
  const badges = await getUserBadges(db, user.id);

  return (
    <ProfileTabs
      user={user}
      currentUserId={currentUserId}
      isFollowing={viewer.isFollowing}
      posts={posts}
      solutions={solutions}
      comments={comments}
      badges={badges}
      bookmarks={viewer.bookmarks}
      circles={circles}
      circlePoints={circlePoints}
      streak={streak}
    />
  );
}
