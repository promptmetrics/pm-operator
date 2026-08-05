export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
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
  adminGetGroup,
  adminUpdateGroup,
  adminDeleteGroup,
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
    const data = await adminGetGroup(getDb(), id);
    return ok(data);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Group not found') return notFound('Group not found');
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
  const body = await parseBody(request, z.any());
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const group = await adminUpdateGroup(getDb(), id, body);
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'update_group',
      targetType: 'group',
      targetId: id,
      details: { changes: Object.keys(body) },
    });
    return ok(group);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Group not found') return notFound('Group not found');
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
    const result = await adminDeleteGroup(getDb(), id);
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'delete_group',
      targetType: 'group',
      targetId: id,
      details: { cascadeCounts: result.cascadeCounts },
    });
    return ok(result);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Group not found') return notFound('Group not found');
    throw err;
  }
}
