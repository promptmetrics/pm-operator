export const runtime = 'nodejs';

import { toggleBookmarkRequestSchema, type ToggleBookmarkRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { toggleBookmark } from '@/lib/services/bookmarks';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, toggleBookmarkRequestSchema);
  if (body instanceof Response) return body;
  const input = body as ToggleBookmarkRequest;

  const result = await toggleBookmark(getDb(), session.userId, input.postId);
  return ok(result);
}
