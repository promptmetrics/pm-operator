export const runtime = 'nodejs';

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
import { listLeaderboard, getLeaderboardViewer } from '@/lib/services/community';

export async function GET(request: Request) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const query = parseQuery(new URL(request.url).searchParams, leaderboardQuerySchema);
  if (query instanceof Response) return query;

  const { type, groupSlug, period, page, limit } = query;

  let groupId: string = schema.GLOBAL_GROUP_ID;
  if (groupSlug) {
    const group = await getGroupBySlug(getDb(), groupSlug, session?.user?.id);
    if (!group) return notFound('Group not found');
    groupId = group.id;
  }

  const offset = (page - 1) * limit;
  const board = { groupId, period, type };

  const [rows, viewer] = await Promise.all([
    listLeaderboard(getDb(), { ...board, limit: limit + 1, offset }),
    session?.user
      ? getLeaderboardViewer(getDb(), session.user.id, board)
      : Promise.resolve(null),
  ]);

  const entries = rows.slice(0, limit);

  return ok(
    { type, groupSlug: groupSlug ?? null, period, leaderboard: entries, viewer },
    paginationMeta(page, limit, rows.length > limit)
  );
}
