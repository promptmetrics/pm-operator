export const runtime = 'nodejs';

import { acceptInviteRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { acceptInvite } from '@/lib/services/groups';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, acceptInviteRequestSchema);
  if (body instanceof Response) return body;

  await params; // path slug present for REST parity; invite code drives the action
  const membership = await acceptInvite(getDb(), body.code, session.userId);
  return ok(membership);
}
