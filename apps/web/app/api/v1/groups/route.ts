export const runtime = 'nodejs';

import { createGroupRequestSchema } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
  paginationMeta,
} from '@/lib/api/server';
import { listGroups, createGroup } from '@/lib/services/groups';

export async function GET(request: Request) {
  const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
  if (limited) return limited;

  const { session } = await getSession();
  const groups = await listGroups(getDb(), session?.user?.id);
  return ok({ groups }, paginationMeta(1, groups.length, false));
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit(
    'authenticatedWrite',
    session.userId
  );
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createGroupRequestSchema);
  if (body instanceof Response) return body;

  const group = await createGroup(getDb(), body, session.userId);
  return ok(group);
}
