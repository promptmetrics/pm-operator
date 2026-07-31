export const runtime = 'nodejs';

import { feedQuerySchema, type FeedQuery } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  parseQuery,
  rateLimit,
  getClientIp,
  paginationMeta,
} from '@/lib/api/server';
import { listFeed } from '@/lib/services/posts';

export async function GET(request: Request) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const parsed = parseQuery(new URL(request.url).searchParams, feedQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = parsed as FeedQuery;

  const feed = await listFeed(getDb(), query, session?.user?.id);
  return ok(
    feed,
    paginationMeta(query.page, query.limit, Boolean(feed.nextCursor))
  );
}
