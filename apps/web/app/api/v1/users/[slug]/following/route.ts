export const runtime = 'nodejs';

import { followListQuerySchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  notFound,
  forbidden,
  requireSession,
  parseQuery,
  rateLimit,
  paginationMeta,
} from '@/lib/api/server';
import { getFollowTarget, listFollowing } from '@/lib/services/follows';

// GET /api/v1/users/[slug]/following — who this user follows. Edge lists are
// self-only (decision 2A): only the subject may list their own follows.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const query = parseQuery(new URL(request.url).searchParams, followListQuerySchema);
  if (query instanceof Response) return query;

  const { slug } = await params;
  const target = await getFollowTarget(getDb(), slug);
  if (!target) return notFound('User not found');

  if (target.id !== session.userId) {
    return forbidden('You can only view your own following list');
  }

  const { items, hasMore } = await listFollowing(getDb(), target.id, query);
  return ok({ following: items }, paginationMeta(query.page, query.limit, hasMore));
}