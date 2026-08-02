import { redirect, notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getFollowTarget, listFollowing } from '@/lib/services/follows';
import { FollowList } from '../../../components/FollowList';

// GET /u/[slug]/following — who this user follows. Edge lists are self-only
// (decision 2A): only the subject can browse their own following list. Non-self
// viewers are sent back to the profile. Pool-safe: getFollowTarget (1) then
// listFollowing (≤2-wave).
export default async function FollowingRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/u/${slug}/following`)}`);
  }

  const db = createServiceDb();
  const target = await getFollowTarget(db, slug);
  if (!target) notFound();

  if (target.id !== session.user.id) {
    redirect(`/u/${slug}`);
  }

  const { items } = await listFollowing(db, target.id, { page: 1, limit: 50 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-serif text-2xl font-semibold text-[var(--pm-ink)]">
        People you follow
      </h1>
      <FollowList items={items} emptyMessage="You're not following anyone yet." />
    </div>
  );
}