export const runtime = 'nodejs';

import { sql } from 'drizzle-orm';
import { getDb, ok, forbidden } from '@/lib/api/server';

function authorizeCron(request: Request): Response | null {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const authorization = request.headers.get('authorization');
  if (authorization !== expected) {
    return forbidden('Unauthorized');
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const result = await getDb().execute(sql`
    UPDATE posts p
    SET view_count = v.cnt
    FROM (
      SELECT post_id, COUNT(*) AS cnt
      FROM post_views
      GROUP BY post_id
    ) v
    WHERE p.id = v.post_id
  `);

  return ok({ updated: (result as unknown as { rowCount: number }).rowCount ?? 0 });
}
