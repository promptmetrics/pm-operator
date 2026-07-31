export const runtime = 'nodejs';

import {
  getDb,
  ok,
  requireSession,
  rateLimit,
} from '@/lib/api/server';
import { awardDailyVisit } from '@/lib/services/points';

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const event = await awardDailyVisit(getDb(), session.userId);
  return ok({ awarded: event !== null, points: event?.points });
}
