export const runtime = 'nodejs';

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
import { listGroups, createGroup } from '@/lib/services/groups';
// Track 2C/3D: shared 300 s cache entry (key 'groups-list-stats') — the same
// wrapper the community layout rail and /g directory use, extracted so the
// key can never drift. Only the viewer-specific base query runs fresh per
// request: budget 1 query warm, 2 cold — never concurrent.
import { getCachedGroupStats } from '@/lib/services/group-stats-cache';

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
