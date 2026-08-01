export const runtime = 'nodejs';

import { bookmarksQuerySchema, type BookmarksQuery } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  paginationMeta,
} from '@/lib/api/server';
import { listBookmarkedPosts } from '@/lib/services/bookmarks';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const parsed = parseQuery(new URL(request.url).searchParams, bookmarksQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = parsed as BookmarksQuery;

  const { posts, hasMore } = await listBookmarkedPosts(getDb(), session.userId, query);
  return ok({ posts }, paginationMeta(query.page, query.limit, hasMore));
}
