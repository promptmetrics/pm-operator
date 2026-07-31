export const runtime = 'nodejs';

import { createReactionRequestSchema, type CreateReactionRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { toggleReaction } from '@/lib/services/reactions';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createReactionRequestSchema);
  if (body instanceof Response) return body;
  const input = body as CreateReactionRequest;

  const result = await toggleReaction(getDb(), input, session.userId);
  return ok(result.reaction ?? { removed: true });
}
