export const runtime = 'nodejs';

import { flagQuerySchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  paginationMeta,
  forbidden,
} from '@/lib/api/server';
import { listModerationQueue } from '@/lib/services/moderation';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, flagQuerySchema);
  if (query instanceof Response) return query;

  try {
    const { items, hasMore } = await listModerationQueue(getDb(), session.userId, query);
    return ok({ flags: items }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Moderator access required');
    throw err;
  }
}
