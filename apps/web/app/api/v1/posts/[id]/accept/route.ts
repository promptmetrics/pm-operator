export const runtime = 'nodejs';

import { acceptSolutionRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { acceptSolution } from '@/lib/services/comments';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, acceptSolutionRequestSchema);
  if (body instanceof Response) return body;

  const { id } = await params;
  const comment = await acceptSolution(getDb(), id, body, session.userId);
  return ok(comment);
}
