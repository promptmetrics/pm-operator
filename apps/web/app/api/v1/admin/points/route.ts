export const runtime = 'nodejs';

import { awardPointsRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
  notFound,
} from '@/lib/api/server';
import { requireGlobalAdmin, adminAwardPoints } from '@/lib/services/admin';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, awardPointsRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const result = await adminAwardPoints(getDb(), session.userId, body);
    return ok(result, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'User not found') return notFound('User not found');
    throw err;
  }
}
