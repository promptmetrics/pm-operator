import Link from 'next/link';
import type { Metadata } from 'next';
import { Users, MessageSquare } from 'lucide-react';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listGroupsWithPostCounts } from '@/lib/services/community';

export const metadata: Metadata = {
  title: 'Circles',
};

export default async function CirclesDirectoryRoute() {
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const { groups, totalPosts } = await listGroupsWithPostCounts(db, currentUserId);

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
          {groups.map((group) => (
            <li key={group.slug}>
              <Link
                href={`/g/${group.slug}`}
                className="flex h-full flex-col gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-5 shadow-[var(--pm-shadow)] transition-shadow hover:shadow-[var(--pm-shadow-lg)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color ?? 'var(--pm-muted-soft)' }}
                    aria-hidden="true"
                  />
                  <h2 className="font-serif text-base font-semibold text-[var(--pm-ink)]">
                    {group.name}
                  </h2>
                </div>
                {group.description ? (
                  <p className="line-clamp-2 text-sm text-[var(--pm-muted)]">{group.description}</p>
                ) : null}
                <p className="mt-auto flex items-center gap-4 text-xs text-[var(--pm-muted)]">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {group.memberCount} members
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    {group.postCount} posts
                  </span>
                </p>
              </Link>
            </li>
          ))}
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
