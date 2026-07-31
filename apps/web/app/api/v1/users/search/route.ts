export const runtime = 'nodejs';

import { sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { ErrorCode } from '@pm-operator/api';
import {
  getDb,
  ok,
  error,
  requireSession,
  rateLimit,
} from '@/lib/api/server';
import { toPublicUserProfile } from '@/lib/services/shared';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return error(ErrorCode.VALIDATION_ERROR, 'Query must be at least 2 characters', 400, 'q');
  }

  const users = await getDb().query.users.findMany({
    where: sql`lower(${schema.users.username}) like ${q + '%'}`,
    limit: 10,
  });

  const results = await Promise.all(
    users.map((user: typeof schema.users.$inferSelect) => toPublicUserProfile(user))
  );
  return ok({ results });
}
