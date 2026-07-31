export const runtime = 'nodejs';

import { patchCommentRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { updateComment, deleteComment } from '@/lib/services/comments';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, patchCommentRequestSchema);
  if (body instanceof Response) return body;

  const { id } = await params;
  const comment = await updateComment(getDb(), id, body, session.userId);
  return ok(comment);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const { id } = await params;
  const comment = await deleteComment(getDb(), id, session.userId);
  return ok(comment);
}
