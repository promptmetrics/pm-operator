export const runtime = 'nodejs';

import { patchPostRequestSchema } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { getPostById, updatePost, deletePost } from '@/lib/services/posts';
import { recordPostView } from '@/lib/services/post-views';

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
  const post = await getPostById(getDb(), id, session?.user?.id);
  if (!post) return notFound('Post not found');

  await recordPostView(getDb(), id, {
    userId: session?.user?.id,
    ip: getClientIp(request),
  });

  return ok(post);
}

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

  const body = await parseBody(request, patchPostRequestSchema);
  if (body instanceof Response) return body;

  const { id } = await params;
  const post = await updatePost(getDb(), id, body, session.userId);
  return ok(post);
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
  const post = await deletePost(getDb(), id, session.userId);
  return ok(post);
}
