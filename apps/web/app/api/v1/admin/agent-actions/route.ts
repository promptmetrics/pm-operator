export const runtime = 'nodejs';

import { agentActionListQuerySchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  forbidden,
  paginationMeta,
} from '@/lib/api/server';
import { requireGlobalAdmin, adminListAgentActions } from '@/lib/services/admin';

// T8.12 (ADMIN-5): list-only audit of MCP agent actions. Admin-gated; no
// create/update/delete. The service runs two sequential bounded queries
// (actions page, then usernames for that page) — pool-safe.
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, agentActionListQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const { actions, hasMore } = await adminListAgentActions(getDb(), query);
    return ok({ actions }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}