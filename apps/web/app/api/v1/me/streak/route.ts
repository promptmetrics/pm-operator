export const runtime = 'nodejs';

import { sql } from 'drizzle-orm';
import type { MyStreakResponse } from '@pm-operator/api';
import { getDb, ok, notFound, requireSession } from '@/lib/api/server';
import { toNumber } from '@/lib/services/shared';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  // All day math happens in SQL against UTC so the DB clock is the single
  // source of truth (same convention as advanceStreak / the daily indexes).
  const rows = (await getDb().execute(sql`
    SELECT
      u.streak_days,
      u.longest_streak_days,
      to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today,
      to_char(date_trunc('week', (now() AT TIME ZONE 'UTC'))::date, 'YYYY-MM-DD') AS week_start,
      COALESCE(
        (
          SELECT array_agg(DISTINCT to_char(CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date), 'YYYY-MM-DD'))
          FROM point_events pe
          WHERE pe.user_id = u.id
            AND pe.event_type IN ('topic_created', 'comment_created')
            AND CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date)
                >= date_trunc('week', (now() AT TIME ZONE 'UTC'))::date
            AND CAST((pe.awarded_at AT TIME ZONE 'UTC') AS date)
                < date_trunc('week', (now() AT TIME ZONE 'UTC'))::date + 7
        ),
        '{}'
      ) AS active_days
    FROM users u
    WHERE u.id = ${session.userId}
  `)) as unknown as Array<{
    streak_days: number | string;
    longest_streak_days: number | string;
    today: string;
    week_start: string;
    active_days: string[];
  }>;
  const row = rows[0];
  if (!row) return notFound('User not found');

  const activeDays = new Set(row.active_days ?? []);
  const weekStart = new Date(`${row.week_start}T00:00:00Z`);

  const days: MyStreakResponse['days'] = DAY_LABELS.map((label, i) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    const state = activeDays.has(date) ? 'done' : date === row.today ? 'pending' : 'empty';
    return { date, label, state };
  });

  const response: MyStreakResponse = {
    current: toNumber(row.streak_days),
    best: toNumber(row.longest_streak_days),
    days,
  };

  return ok(response);
}
