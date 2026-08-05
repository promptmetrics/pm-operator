export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  paginationMeta,
  forbidden,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminListAuditLogs,
} from '@/lib/services/admin';

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  moderatorId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  circleId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, historyQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    const { logs, hasMore } = await adminListAuditLogs(getDb(), {
      moderatorId: query.moderatorId,
      actionType: query.actionType,
      circleId: query.circleId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    });

    return ok({ logs }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
