export const runtime = 'nodejs';

import { createPostRequestSchema, POINT_WEIGHTS, type CreatePostRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { createPost } from '@/lib/services/posts';
import { awardPoints, advanceStreak } from '@/lib/services/points';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createPostRequestSchema);
  if (body instanceof Response) return body;
  const input = body as CreatePostRequest;

  const post = await createPost(getDb(), input, session.userId);

  await awardPoints(getDb(), {
    userId: session.userId,
    eventType: 'topic_created',
    points: POINT_WEIGHTS.topic_created,
    sourceId: post.id,
    groupId: post.groupId,
    context: { title: post.title },
  });

  await advanceStreak(getDb(), session.userId);

  return ok(post);
}
