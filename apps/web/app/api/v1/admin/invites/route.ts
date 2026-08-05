export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
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
  adminListInvites,
  adminCreateInvite,
  adminRevokeInvite,
  adminCreateAuditLog,
} from '@/lib/services/admin';

const listQuerySchema = z.object({
  circleId: z.string().optional(),
  status: z.enum(['active', 'expired', 'all']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const createInviteSchema = z.object({
  groupId: z.string().min(1),
  maxUses: z.number().int().positive().default(1),
  expiresAt: z.string().optional(),
  role: z.enum(['member', 'moderator', 'admin']).default('member'),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, listQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const { invites, hasMore } = await adminListInvites(getDb(), query);
    return ok({ invites }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, createInviteSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const invite = await adminCreateInvite(getDb(), {
      ...body,
      inviterId: session.userId,
    });
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'create_invite',
      targetType: 'invite',
      targetId: invite.id,
      metadata: { groupId: body.groupId, role: body.role },
    });
    return ok(invite, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Group not found') return notFound('Group not found');
    throw err;
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return notFound('Invite not found');

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    await adminRevokeInvite(getDb(), id);
    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: 'revoke_invite',
      targetType: 'invite',
      targetId: id,
    });
    return ok({ success: true });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Invite not found') return notFound('Invite not found');
    throw err;
  }
}
