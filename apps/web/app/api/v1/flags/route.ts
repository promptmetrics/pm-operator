export const runtime = 'nodejs';

import { createFlagRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { createFlag } from '@/lib/services/flags';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createFlagRequestSchema);
  if (body instanceof Response) return body;

  const flag = await createFlag(getDb(), body, session.userId);
  return ok(flag);
}
