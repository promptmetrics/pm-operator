export const runtime = 'nodejs';

import { sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { leaderboardQuerySchema } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  notFound,
  parseQuery,
  rateLimit,
  getClientIp,
  paginationMeta,
} from '@/lib/api/server';
import { getGroupBySlug } from '@/lib/services/groups';
import { toNumber } from '@/lib/services/shared';

export async function GET(request: Request) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const query = parseQuery(new URL(request.url).searchParams, leaderboardQuerySchema);
  if (query instanceof Response) return query;

  const { type, groupSlug, period, page, limit } = query;
  const groupId = groupSlug
    ? (await getGroupBySlug(getDb(), groupSlug, session?.user?.id))?.id
    : schema.GLOBAL_GROUP_ID;

  if (groupSlug && !groupId) return notFound('Group not found');

  const offset = (page - 1) * limit;

  const ranked = await getDb().execute(sql`
    with as_count as (
      select ${schema.comments.authorId} as user_id, count(*)::int as count
      from ${schema.comments}
      inner join ${schema.posts} on ${schema.posts.acceptedCommentId} = ${schema.comments.id}
      group by ${schema.comments.authorId}
    )
    select
      rank() over (order by ${schema.userScores.score} desc) as rank,
      ${schema.users.userslug} as userslug,
      ${schema.users.username} as username,
      ${schema.userScores.score} as score,
      coalesce(as_count.count, 0) as accepted_solutions
    from ${schema.userScores}
    inner join ${schema.users} on ${schema.users.id} = ${schema.userScores.userId}
    left join as_count on as_count.user_id = ${schema.users.id}
    where ${schema.userScores.groupId} = ${groupId}
      and ${schema.userScores.period} = ${period}
    order by ${schema.userScores.score} desc
    limit ${limit + 1}
    offset ${offset}
  `);

  const rows = (ranked as unknown as { rows: any[] }).rows;
  const entries = rows.slice(0, limit).map((row) => ({
    rank: Number(row.rank),
    userslug: row.userslug,
    username: row.username,
    score: toNumber(row.score),
    acceptedSolutions: Number(row.accepted_solutions ?? 0),
  }));

  return ok(
    { type, groupSlug: groupSlug ?? null, period, leaderboard: entries },
    paginationMeta(page, limit, rows.length > limit)
  );
}
