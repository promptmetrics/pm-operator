export const runtime = 'nodejs';

import { createCommentRequestSchema } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { listCommentsForPost, createComment } from '@/lib/services/comments';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const { id } = await params;
  const comments = await listCommentsForPost(getDb(), id, session?.user?.id);
  return ok({ comments });
}

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

  const body = await parseBody(request, createCommentRequestSchema);
  if (body instanceof Response) return body;

  const { id } = await params;
  // createComment awards comment_created itself; a second award here was
  // always a no-op via the (user, event, source) idempotency guard.
  const comment = await createComment(getDb(), id, body, session.userId);

  return ok(comment);
}
