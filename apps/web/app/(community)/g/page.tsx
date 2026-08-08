import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { Lock } from 'lucide-react';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listGroupsWithPostCounts } from '@/lib/services/community';
import { getCachedGroupStats } from '@/lib/services/group-stats-cache';
import { CircleCardAction } from '../components/CircleCardAction';

export const metadata: Metadata = {
  title: 'Circles',
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default async function CirclesDirectoryRoute() {
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  // Strictly sequential, never Promise.all: the community layout's rail query
  // runs concurrently with this page on every navigation, so the page holds
  // its own concurrency at 1 (pool = 3; see DESIGN-GAP-REPORT
  // "Pool-starvation gotcha"). Base listing → viewer memberships → shared
  // stats cache (0 fresh queries warm, 1 cold).
  const { groups, totalPosts } = await listGroupsWithPostCounts(db, currentUserId);

  let joinedGroupIds = new Set<string>();
  if (currentUserId) {
    const memberships = await db
      .select({ groupId: schema.groupMemberships.groupId })
      .from(schema.groupMemberships)
      .where(eq(schema.groupMemberships.userId, currentUserId));
    joinedGroupIds = new Set(memberships.map((m) => m.groupId));
  }

  const statsMap = await getCachedGroupStats();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">Circles</h1>
        <p className="text-sm text-[var(--pm-muted)]">
          {groups.length} circles · {totalPosts} posts
        </p>
      </div>

      {groups.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const stats = statsMap[group.id] ?? { postsThisMonth: 0, solvedRate: null };
            return (
              <li
                key={group.slug}
                data-testid={`circle-card-${group.slug}`}
                className="flex h-full flex-col gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-5 shadow-[var(--pm-shadow)] transition-shadow hover:shadow-[var(--pm-shadow-lg)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color ?? 'var(--pm-muted-soft)' }}
                    aria-hidden="true"
                  />
                  <h2 className="min-w-0 flex-1 truncate font-serif text-base font-semibold text-[var(--pm-ink)]">
                    <Link href={`/g/${group.slug}`} className="hover:text-[var(--pm-coral-dark)]">
                      {group.name}
                    </Link>
                  </h2>
                  {group.visibility === 'invite_only' ? (
                    <span className="shrink-0 text-[var(--pm-muted)]" title="Invite only">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">Invite only</span>
                    </span>
                  ) : null}
                </div>

                {group.description ? (
                  <p className="line-clamp-2 text-sm text-[var(--pm-muted)]">
                    {group.description}
                  </p>
                ) : null}

                <p
                  data-testid={`circle-card-stats-${group.slug}`}
                  className="mt-auto text-xs tabular-nums text-[var(--pm-muted)]"
                >
                  {group.memberCount.toLocaleString()} members
                  <span aria-hidden="true"> · </span>
                  {stats.postsThisMonth.toLocaleString()} posts/mo
                  <span aria-hidden="true"> · </span>
                  {stats.solvedRate !== null ? (
                    <>{formatPercent(stats.solvedRate)} solved</>
                  ) : (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">solved rate unavailable</span>
                    </>
                  )}
                </p>

                <CircleCardAction
                  slug={group.slug}
                  name={group.name}
                  visibility={group.visibility}
                  initialJoined={joinedGroupIds.has(group.id)}
                  isLoggedIn={Boolean(currentUserId)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
          <p className="font-serif text-lg font-medium text-[var(--pm-ink)]">No circles yet</p>
          <p className="mt-1 text-sm text-[var(--pm-muted)]">Circles appear here once created.</p>
        </div>
      )}
    </div>
  );
}
