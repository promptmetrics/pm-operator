export const runtime = 'nodejs';

import { resolveFlagRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  notFound,
  forbidden,
} from '@/lib/api/server';
import { resolveFlag, deleteFlag } from '@/lib/services/moderation';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await parseBody(request, resolveFlagRequestSchema);
  if (body instanceof Response) return body;

  try {
    const flag = await resolveFlag(getDb(), id, body, session.userId);
    return ok(flag);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Moderator access required');
    if (err.message === 'Flag not found') return notFound('Flag not found');
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
    await deleteFlag(getDb(), id, session.userId);
    return new Response(null, { status: 204 });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Moderator access required');
    if (err.message === 'Flag not found') return notFound('Flag not found');
    throw err;
  }
}
