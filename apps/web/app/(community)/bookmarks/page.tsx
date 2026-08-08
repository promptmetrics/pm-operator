import { redirect } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listBookmarkedPosts } from '@/lib/services/bookmarks';
import { BookmarksPage } from '../components/BookmarksPage';

export default async function BookmarksRoute() {
  const { session } = await getSession();
  const currentUserId = session?.user?.id;
  if (!currentUserId) {
    redirect('/login?returnUrl=%2Fbookmarks');
  }

  // Single query (+ the layout's one rail query on this request path) — well
  // within the pool budget. Pagination continues client-side through
  // GET /api/v1/me/bookmarks.
  const db = createServiceDb();
  const { posts, hasMore } = await listBookmarkedPosts(db, currentUserId, {
    page: 1,
    limit: 20,
  });

  return (
    <BookmarksPage initialPosts={posts} initialHasMore={hasMore} currentUserId={currentUserId} />
  );
}
