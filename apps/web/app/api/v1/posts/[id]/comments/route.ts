export const runtime = 'nodejs';

import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
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
import { awardPoints } from '@/lib/services/points';

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
  const comment = await createComment(getDb(), id, body, session.userId);

  const post = await getDb().query.posts.findFirst({
    where: eq(schema.posts.id, comment.postId),
    columns: { groupId: true },
  });

  await awardPoints(getDb(), {
    userId: session.userId,
    eventType: 'comment_created',
    points: 3,
    sourceId: comment.id,
    groupId: post?.groupId ?? null,
    context: { postId: comment.postId },
  });

  return ok(comment);
}
