export const runtime = 'nodejs';

import { unstable_cache } from 'next/cache';
import { createGroupRequestSchema, type GroupListItem } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
  paginationMeta,
} from '@/lib/api/server';
import { listGroups, listGroupStats, createGroup } from '@/lib/services/groups';

// Track 2C: the community layout rail calls this route on every navigation.
// The stats aggregate is viewer-independent (see listGroupStats), so one
// cached entry serves every viewer for 300 s; only the viewer-specific base
// query (visibility / membership) runs fresh per navigation. Keeps the
// per-navigation budget at 1 query warm, 2 cold — never concurrent.
const getCachedGroupStats = unstable_cache(
  async () => listGroupStats(getDb()),
  ['groups-list-stats'],
  { revalidate: 300 }
);

export async function GET(request: Request) {
  const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
  if (limited) return limited;

  const { session } = await getSession();
  const groups = await listGroups(getDb(), session?.user?.id);

  const includeStats =
    new URL(request.url).searchParams.get('includeStats') === '1';
  if (!includeStats) {
    return ok({ groups }, paginationMeta(1, groups.length, false));
  }

  const statsMap = await getCachedGroupStats();
  const withStats: GroupListItem[] = groups.map((group) => ({
    ...group,
    stats: statsMap[group.id] ?? { postsThisMonth: 0, solvedRate: null },
  }));
  return ok({ groups: withStats }, paginationMeta(1, withStats.length, false));
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit(
    'authenticatedWrite',
    session.userId
  );
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createGroupRequestSchema);
  if (body instanceof Response) return body;

  const group = await createGroup(getDb(), body, session.userId);
  return ok(group);
}
