export const runtime = 'nodejs';

import type { GetUserProfileResponse } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import { getDb, ok, notFound, rateLimit, getClientIp } from '@/lib/api/server';
import { getUserProfile, listUserCircleContributions } from '@/lib/services/users';
import { getUserBadges } from '@/lib/services/badges';

// Public profile read (WS6/T6.3) — REST parity with the MCP get_user_profile
// tool, extended with badges and per-circle contributions for the profile page.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const { slug } = await params;
  const db = getDb();
  const user = await getUserProfile(db, slug);
  if (!user) return notFound('User not found');

  // Sequential on purpose: getUserBadges fans out its own concurrent queries,
  // and stacking it on top of the contributions queries starves the small
  // per-instance pool (DB_POOL_SIZE) instead of queueing.
  const circles = await listUserCircleContributions(db, user.id);
  const badges = await getUserBadges(db, user.id);

  const response: GetUserProfileResponse = { user, badges, circles };
  return ok(response);
}
