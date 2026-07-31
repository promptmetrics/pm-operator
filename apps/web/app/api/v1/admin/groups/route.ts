export const runtime = 'nodejs';

import { createGroupRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
} from '@/lib/api/server';
import { requireGlobalAdmin, adminListGroups, adminCreateGroup } from '@/lib/services/admin';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const groups = await adminListGroups(getDb());
    return ok({ groups });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, createGroupRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const group = await adminCreateGroup(getDb(), body, session.userId);
    return ok(group, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
