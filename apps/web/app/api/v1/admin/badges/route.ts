export const runtime = 'nodejs';

import { createBadgeRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
} from '@/lib/api/server';
import { requireGlobalAdmin, adminListBadges, adminCreateBadge } from '@/lib/services/admin';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const badges = await adminListBadges(getDb());
    return ok({ badges });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, createBadgeRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const badge = await adminCreateBadge(getDb(), body);
    return ok(badge, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
