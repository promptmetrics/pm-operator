export const runtime = 'nodejs';

import { userListQuerySchema, patchUserRoleRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  parseBody,
  forbidden,
  notFound,
  paginationMeta,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminListUsers,
  adminSetUserRole,
} from '@/lib/services/admin';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, userListQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const { users, hasMore } = await adminListUsers(getDb(), query);
    return ok({ users }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('id');
  if (!userId) {
    return notFound('User not found');
  }

  const body = await parseBody(request, patchUserRoleRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    await adminSetUserRole(getDb(), userId, body.role);
    return ok({ success: true });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found') return notFound('User not found');
    throw err;
  }
}
