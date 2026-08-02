export const runtime = 'nodejs';

import { getDb, ok, notFound, requireSession } from '@/lib/api/server';
import { getUserStreakWeek } from '@/lib/services/users';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const streak = await getUserStreakWeek(getDb(), session.userId);
  if (!streak) return notFound('User not found');

  return ok(streak);
}
