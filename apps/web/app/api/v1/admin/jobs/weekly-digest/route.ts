// Weekly digest cron (T8.3). Runs Mondays 07:07 UTC (see vercel.json `crons`).
// Computes the trailing-7-day digest from our own DB, then emails every user
// who opted into users.preferences.weeklyDigest = true, in bounded batches so
// the small per-instance DB pool is never starved.
//
// Pool rule: the digest computation is bounded (see lib/services/digest.ts,
// ≤3 concurrent). The recipient loop is a single cursor-paginated findMany per
// batch (1 DB query at a time) followed by network-only Loops POSTs — no wide
// fan-out of DB queries. A quiet week (no posts and no solutions) sends nothing.

export const runtime = 'nodejs';

import { and, gt, asc, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { getDb, ok, forbidden } from '@/lib/api/server';
import { getWeeklyDigest } from '@/lib/services/digest';
import { sendWeeklyDigestEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 50;

function authorizeCron(request: Request): Response | null {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (request.headers.get('authorization') !== expected) {
    return forbidden('Unauthorized');
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const db = getDb();
  const digest = await getWeeklyDigest(db).catch(() => null);

  if (!digest || (digest.posts === 0 && digest.solutionsAccepted === 0)) {
    return ok({ sent: 0, skipped: 0, reason: 'quiet-week' });
  }

  const optedIn = sql`${schema.users.preferences}->>'weeklyDigest' = 'true'`;
  let cursor: string | null = null;
  let sent = 0;
  let skipped = 0;

  while (true) {
    const batch = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        fullName: schema.users.fullName,
        username: schema.users.username,
      })
      .from(schema.users)
      .where(cursor ? and(optedIn, gt(schema.users.id, cursor)) : optedIn)
      .orderBy(asc(schema.users.id))
      .limit(BATCH_SIZE + 1);

    const page = batch.slice(0, BATCH_SIZE);
    for (const user of page) {
      // Sequential sends — Loops rate limits are easier on serial traffic, and
      // these are network calls (not DB queries) so they don't touch the pool.
      const name = user.fullName || user.username;
      if (!user.email || !name) {
        skipped++;
        continue;
      }
      try {
        await sendWeeklyDigestEmail({ email: user.email, name, data: digest });
        sent++;
      } catch {
        skipped++;
      }
    }

    if (batch.length <= BATCH_SIZE) break;
    cursor = batch[BATCH_SIZE - 1].id;
  }

  logger.info({ sent, skipped }, 'weekly-digest cron complete');
  return ok({ sent, skipped });
}