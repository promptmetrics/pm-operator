export const runtime = 'nodejs';

import { awardBadgeRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
  notFound,
} from '@/lib/api/server';
import { requireGlobalAdmin, adminAwardBadge } from '@/lib/services/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await parseBody(request, awardBadgeRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    await adminAwardBadge(getDb(), id, session.userId, body.userSlug, body.reason);
    return ok({ awarded: true }, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found' || err.message === 'Badge not found') {
      return notFound(err.message);
    }
    throw err;
  }
}
