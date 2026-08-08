import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { Check, Lock, Settings } from 'lucide-react';
import * as schema from '@pm-operator/db';
import { Button } from '@pm-operator/ui/components/Button';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getGroupBySlug, getGroupStats, getGroupPreviewForInviteOnly, listGroupMembers } from '@/lib/services/groups';
import { listGroupPosts } from '@/lib/services/posts';
import {
  listPinnedPosts,
  listGroupLeaderboard,
  listGroupsWithPostCounts,
  getWritableGroups,
} from '@/lib/services/community';
import { FeedPage } from '../../components/FeedPage';
import { GroupMembershipButton } from '../../components/GroupMembershipButton';
import { GroupInviteButton } from '../../components/GroupInviteButton';
import { InviteOnlyPreview } from '../../components/InviteOnlyPreview';
import { CircleRail } from './CircleRail';
import { UpcomingEventsRail } from './UpcomingEventsRail';
import { listEvents } from '@/lib/services/events';
import { FeedFilter, FeedSort } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function BannerStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-serif text-[22px] font-semibold text-[var(--pm-ink)]">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
        {label}
      </div>
    </div>
  );
}

export default async function GroupRoute({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { groupSlug: slug } = await params;
  const paramsQuery = await searchParams;

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const group = await getGroupBySlug(db, slug, currentUserId);
  if (!group) {
    // T8.9 (spec §5.5/522): invite-only circles show a gated preview + invite-
    // code entry to logged-in non-members instead of a bare 404. This branch
    // returns early (1 query) and skips the feed waves, so the pool budget is
    // untouched. Paid/private circles still 404 (not enabled at launch).
    if (currentUserId) {
      const preview = await getGroupPreviewForInviteOnly(db, slug);
      if (preview) {
        return <InviteOnlyPreview {...preview} />;
      }
    }
    notFound();
  }

  const filterParam = typeof paramsQuery.filter === 'string' ? paramsQuery.filter : undefined;
  const filter: FeedFilter = Object.values(FeedFilter).includes(filterParam as FeedFilter)
    ? (filterParam as FeedFilter)
    : FeedFilter.ALL;
  const sortParam = typeof paramsQuery.sort === 'string' ? paramsQuery.sort : undefined;
  const sort: FeedSort = Object.values(FeedSort).includes(sortParam as FeedSort)
    ? (sortParam as FeedSort)
    : FeedSort.NEW;
  const pageParam = typeof paramsQuery.page === 'string' ? Number(paramsQuery.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;

  // Bounded waves (≤2 concurrent queries): a single wide Promise.all starves
  // the small per-instance DB pool and hangs instead of queueing — abandoned
  // clients then pin pooler slots and wedge the whole database (2026-08-02
  // incident; see DESIGN-GAP-REPORT "Pool-starvation gotcha"). The community
  // layout now runs one rail query concurrently with this page on every
  // navigation, so page waves stay at ≤2 to keep the request path within the
  // pool of 3.
  const [membership, currentUser] = await Promise.all([
    currentUserId
      ? db.query.groupMemberships.findFirst({
          where: and(
            eq(schema.groupMemberships.groupId, group.id),
            eq(schema.groupMemberships.userId, currentUserId)
          ),
        })
      : Promise.resolve(null),
    currentUserId
      ? db.query.users.findFirst({
          where: eq(schema.users.id, currentUserId),
          columns: { role: true, username: true },
        })
      : Promise.resolve(null),
  ]);

  const [writableGroups, { posts, nextCursor }] = await Promise.all([
    currentUserId ? getWritableGroups(db, currentUserId) : Promise.resolve([]),
    listGroupPosts(db, slug, { filter, sort, page, limit: 20 }, currentUserId),
  ]);

  const [pinned, leaderboard] = await Promise.all([
    listPinnedPosts(db, group.id, currentUserId),
    listGroupLeaderboard(db, group.id, 'weekly', 5),
  ]);

  const [stats, members] = await Promise.all([
    getGroupStats(db, group.id, currentUserId),
    listGroupMembers(db, slug, currentUserId),
  ]);

  const [circles, upcomingEvents] = await Promise.all([
    listGroupsWithPostCounts(db, currentUserId),
    listEvents(db, {
      groupSlug: slug,
      upcoming: true,
      limit: 3,
      offset: 0,
    }),
  ]);

  const canInvite =
    membership?.role === 'admin' ||
    membership?.role === 'moderator' ||
    currentUser?.role === 'admin';
  // /admin/groups sits behind the site-admin layout guard, so Manage renders
  // for site admins only; group admins/mods keep Invite (D8).
  const canManage = currentUser?.role === 'admin';

  const moderators = members.filter((m) => m.role === 'admin' || m.role === 'moderator');
  const otherCircles = circles.groups.filter((c) => c.slug !== slug).slice(0, 6);

  return (
    <div>
      <div className="mx-auto mb-6 max-w-6xl rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-6 shadow-[var(--pm-shadow)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span
              className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-xl font-serif text-[26px] font-semibold text-[var(--pm-on-ink)]"
              style={{ backgroundColor: group.color ?? 'var(--pm-coral)' }}
              aria-hidden="true"
            >
              {group.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 text-xs text-[var(--pm-muted)]">
                <Link href="/feed" className="hover:text-[var(--pm-ink)]">
                  Feed
                </Link>
                {' / circle'}
              </div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-[28px] font-semibold leading-tight text-[var(--pm-ink)]">
                  {group.name}
                </h1>
                {/* Same markers as the directory card: 🔒 for invite-only,
                    ✓ Joined for members. */}
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper)] px-2 py-0.5 text-xs capitalize text-[var(--pm-muted)]">
                  {group.visibility === 'invite_only' ? (
                    <Lock className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                  {group.visibility.replace('_', ' ')}
                </span>
                {membership ? (
                  <span
                    data-testid="circle-header-joined"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper)] px-2 py-0.5 text-xs font-medium text-[var(--pm-green)]"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Joined
                  </span>
                ) : null}
              </div>
              {group.description ? (
                <p className="text-sm text-[var(--pm-muted)]">{group.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Stat trio matches the directory card: members · posts this
                month · solved rate, with — when there are no questions yet. */}
            <div
              data-testid="circle-header-stats"
              className="flex items-center gap-x-6"
            >
              <BannerStat value={group.memberCount.toLocaleString()} label="Members" />
              <BannerStat value={stats.postsThisMonth.toLocaleString()} label="Posts / mo" />
              <BannerStat
                value={stats.solvedRate !== null ? formatPercent(stats.solvedRate) : '—'}
                label="Solved rate"
              />
            </div>
            <div className="flex items-center gap-2">
              {canInvite ? <GroupInviteButton slug={slug} /> : null}
              {canManage ? (
                <Button variant="secondary" asChild className="gap-1">
                  <Link href="/admin/groups">
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Manage
                  </Link>
                </Button>
              ) : null}
              <GroupMembershipButton
                slug={slug}
                initialIsMember={Boolean(membership)}
                isLoggedIn={Boolean(currentUserId)}
              />
            </div>
          </div>
        </div>
      </div>

      {pinned.length > 0 ? (
        <div className="mx-auto mb-6 max-w-6xl">
          <p className="mb-2 text-sm font-semibold text-[var(--pm-ink)]">Pinned resources</p>
          <ol className="divide-y divide-[var(--pm-line)] overflow-hidden rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]">
            {pinned.map((post, index) => (
              <li key={post.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 font-mono text-xs font-bold text-[var(--pm-muted)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/g/${post.group.slug}/${post.slug}`}
                    className="font-serif text-[15px] font-semibold leading-snug text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                  >
                    {post.title}
                  </Link>
                  <div className="text-xs text-[var(--pm-muted)]">
                    {post.author.username} · {post.commentCount}{' '}
                    {post.commentCount === 1 ? 'comment' : 'comments'}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <FeedPage
        initialPosts={posts}
        initialFilter={filter}
        initialSort={sort}
        initialCursor={nextCursor}
        currentUserId={currentUserId}
        writableGroups={writableGroups}
        leaderboard={leaderboard}
        groupSlug={slug}
        viewerUsername={currentUser?.username}
        showComposerStrip={Boolean(membership) || canInvite}
        railSlot={
          <>
            <UpcomingEventsRail events={upcomingEvents} />
            <CircleRail
              group={group}
              moderators={moderators}
              leaderboard={leaderboard}
              otherCircles={otherCircles}
            />
          </>
        }
      />
    </div>
  );
}
