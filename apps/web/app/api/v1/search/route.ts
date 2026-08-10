export const runtime = 'nodejs';

import { searchQuerySchema, postTypeSchema, z } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  parseQuery,
  rateLimit,
  getClientIp,
  paginationMeta,
} from '@/lib/api/server';
import { searchPosts } from '@/lib/services/search';

const searchRouteQuerySchema = searchQuerySchema.extend({
  type: postTypeSchema.optional(),
  // "Solved only" chip on the search screen (utility-screens reference).
  solved: z.enum(['true']).optional(),
});

export async function GET(request: Request) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const query = parseQuery(new URL(request.url).searchParams, searchRouteQuerySchema);
  if (query instanceof Response) return query;

  const { type, solved, ...searchQuery } = query;
  const result = await searchPosts(getDb(), searchQuery, session?.user?.id, type, solved === 'true');

  return ok(
    result,
    paginationMeta(query.page, query.limit, Boolean(result.nextCursor))
  );
}
