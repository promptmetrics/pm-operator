export const runtime = 'nodejs';

import { onboardingRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
} from '@/lib/api/server';
import { completeOnboarding } from '@/lib/services/users';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, onboardingRequestSchema);
  if (body instanceof Response) return body;

  const updated = await completeOnboarding(getDb(), session.userId, body);
  return ok(updated);
}
