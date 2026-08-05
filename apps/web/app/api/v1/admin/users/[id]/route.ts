export const runtime = 'nodejs';

import { patchUserRoleRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
  notFound,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminGetUser,
  adminSetUserRole,
  adminDeleteUser,
  adminCreateAuditLog,
} from '@/lib/services/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await params;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const data = await adminGetUser(getDb(), id);
    return ok(data);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found') return notFound('User not found');
    throw err;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await parseBody(request, patchUserRoleRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    await adminSetUserRole(getDb(), id, body.role);
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'update_user_role',
      targetType: 'user',
      targetId: id,
      metadata: { newRole: body.role },
    });
    return ok({ success: true });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found') return notFound('User not found');
    throw err;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await params;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const result = await adminDeleteUser(getDb(), id);
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'delete_user',
      targetType: 'user',
      targetId: id,
      metadata: { gdpr: true },
    });
    return ok(result);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found') return notFound('User not found');
    throw err;
  }
}
