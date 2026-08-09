import { getSession } from '@/lib/auth/server';
import { ModerationQueue } from '@/components/ModerationQueue';

/**
 * The admin panel renders the same queue as /moderation.
 *
 * This route used to carry a second, inline implementation that shared only
 * FlagCard, so it picked up the restyled card but kept the old behaviour
 * around it: 3-way status buttons, no resolution receipts, View links that
 * missed comment anchors and DMs, filter params that flagQuerySchema strips
 * server-side, and a `Promise.all` batch resolve that fired one PATCH per
 * selected flag at a 3-connection pool — the shape behind the 2026-08-02
 * outage. Pointing at the shared component retires all of that at once.
 *
 * No gate here on purpose: app/admin/layout.tsx already redirects anyone who
 * is not a global admin.
 */
export default async function AdminModerationPage() {
  const { session } = await getSession();

  return <ModerationQueue currentUserId={session?.user?.id} />;
}
