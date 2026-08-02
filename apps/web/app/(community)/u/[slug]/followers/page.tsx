import { redirect, notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getFollowTarget, listFollowers } from '@/lib/services/follows';
import { FollowList } from '../../../components/FollowList';

// GET /u/[slug]/followers — who follows this user. Edge lists are self-only
// (decision 2A): the counts on the profile banner are public, but only the
// subject can browse their own follower list. Non-self viewers are sent back
// to the profile. Pool-safe: getFollowTarget (1) then listFollowers (≤2-wave).
export default async function FollowersRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/u/${slug}/followers`)}`);
  }

  const db = createServiceDb();
  const target = await getFollowTarget(db, slug);
  if (!target) notFound();

  if (target.id !== session.user.id) {
    redirect(`/u/${slug}`);
  }

  const { items } = await listFollowers(db, target.id, { page: 1, limit: 50 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-serif text-2xl font-semibold text-[var(--pm-ink)]">
        Your followers
      </h1>
      <FollowList items={items} emptyMessage="No followers yet." />
    </div>
  );
}