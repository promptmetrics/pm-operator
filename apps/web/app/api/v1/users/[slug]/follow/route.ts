export const runtime = 'nodejs';

import { ErrorCode } from '@pm-operator/api';
import {
  getDb,
  ok,
  error,
  notFound,
  requireSession,
  requireOnboarding,
  rateLimit,
} from '@/lib/api/server';
import { getFollowTarget, followUser, unfollowUser } from '@/lib/services/follows';

// POST /api/v1/users/[slug]/follow — follow the user. Idempotent.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('follow', session.userId);
  if (limited) return limited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const { slug } = await params;
  const target = await getFollowTarget(getDb(), slug);
  if (!target) return notFound('User not found');

  if (target.id === session.userId) {
    return error(ErrorCode.VALIDATION_ERROR, 'You cannot follow yourself', 400, 'slug');
  }

  const result = await followUser(getDb(), session.userId, target.id);
  return ok(result);
}

// DELETE /api/v1/users/[slug]/follow — unfollow the user. Idempotent.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('follow', session.userId);
  if (limited) return limited;

  const { slug } = await params;
  const target = await getFollowTarget(getDb(), slug);
  if (!target) return notFound('User not found');

  const result = await unfollowUser(getDb(), session.userId, target.id);
  return ok(result);
}