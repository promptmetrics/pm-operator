export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import { pageQuerySchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  forbidden,
  paginationMeta,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminListAgentActions,
  adminGetAgentActionErrorRate,
} from '@/lib/services/admin';

const agentActionListQuerySchema = pageQuerySchema.extend({
  clientId: z.string().optional(),
  toolName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, agentActionListQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    // Check if error rate was requested
    const url = new URL(request.url);
    const includeErrorRate = url.searchParams.get('includeErrorRate') === 'true';

    const { actions, hasMore } = await adminListAgentActions(getDb(), query);

    let errorRate = undefined;
    if (includeErrorRate) {
      errorRate = await adminGetAgentActionErrorRate(getDb());
    }

    return ok(
      { actions, ...(errorRate ? { errorRate } : {}) },
      paginationMeta(query.page, query.limit, hasMore)
    );
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
