import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { Lock, Settings } from 'lucide-react';
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
import {
  CircleHowItWorks,
  CircleChecklistCard,
  CircleEmptyState,
  CircleListFooter,
} from './CircleContentSections';
import { getCircleContent } from '@/lib/circle-content';
import { UpcomingEventsRail } from './UpcomingEventsRail';
import { listEvents } from '@/lib/services/events';
import { getPublicSiteUrl } from '@/lib/site-url';
import { metaDescription } from '@/lib/seo/meta-description';
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from '@/lib/seo/site-jsonld';
import { serializeJsonLd } from '@/lib/seo/post-jsonld';
import { FeedFilter, FeedSort } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function BannerStat({ value, label, teal = false }: { value: string; label: string; teal?: boolean }) {
  return (
    <div>
      <div
        className={`font-mono text-lg font-semibold ${teal ? 'text-[var(--pm-teal-dark)]' : 'text-[var(--pm-ink)]'}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-[var(--pm-muted)]">{label}</div>
    </div>
  );
}

// Circle pages shipped with no metadata at all: no title, no description, no
// canonical — so all five circle URLs in the sitemap inherited the root layout's
// generic title and advertised no canonical of their own.
//
// The lookup is deliberately anonymous. getGroupBySlug returns null for a
// non-public circle when there is no viewer (groups.ts:95), which is what keeps
// an invite-only circle's name out of a title tag that caches and gets shared.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}): Promise<Metadata> {
  const { groupSlug } = await params;
  const db = createServiceDb();
  const group = await getGroupBySlug(db, groupSlug, undefined);

  if (!group || group.visibility !== 'public') {
    return { title: 'Circle', robots: { index: false, follow: false } };
  }

  const canonical = `${getPublicSiteUrl()}/g/${groupSlug}`;
  const description = metaDescription(
    group.description || `${group.name} — a circle on operator.promptmetrics.dev`
  );

  // Title template (SEO plan Phase 2): every public circle titles as
  // "<name> — Operator Stack community" (~44 chars for the longest name,
  // under the 60-char SERP cutoff).
  const title = `${group.name} — Operator Stack community`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  };
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

  // Per-circle content sections (SEO plan Phase 2); undefined for circles
  // without an entry, which keep today's plain list.
  const circleContent = getCircleContent(slug);
  const composeHref = `/post/new?group=${encodeURIComponent(slug)}&type=question`;

  // Structured data only for public circles — schema on a members-only page
  // would publish a name/description the anonymous web isn't meant to see.
  const siteUrl = getPublicSiteUrl();
  const circleUrl = `${siteUrl}/g/${slug}`;
  const circleJsonLd =
    group.visibility === 'public'
      ? buildCollectionPageJsonLd({
          name: group.name,
          description: metaDescription(
            group.description || `${group.name} — a circle on operator.promptmetrics.dev`
          ),
          url: circleUrl,
          siteUrl,
        })
      : null;
  const circleBreadcrumbJsonLd =
    group.visibility === 'public'
      ? buildBreadcrumbJsonLd([
          { name: 'Community', url: `${siteUrl}/feed` },
          { name: group.name, url: circleUrl },
        ])
      : null;

  return (
    <div>
      {circleJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(circleJsonLd) }}
        />
      ) : null}
      {circleBreadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(circleBreadcrumbJsonLd) }}
        />
      ) : null}
      <div className="mx-auto mb-6 max-w-6xl rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow)]">
        <p className="mb-3 text-xs text-[var(--pm-muted)]">
          <Link href="/feed" className="hover:text-[var(--pm-ink)]">
            Feed
          </Link>
          <span aria-hidden="true"> / </span>
          Circles
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] font-serif text-2xl font-semibold text-[var(--pm-on-ink)]"
            style={{ backgroundColor: group.color ?? 'var(--pm-coral)' }}
            aria-hidden="true"
          >
            {group.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl font-semibold leading-tight text-[var(--pm-ink)]">
                {group.name}
              </h1>
              {/* Live extra: visibility marker, same as the directory card. */}
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper)] px-2 py-0.5 text-xs capitalize text-[var(--pm-muted)]">
                {group.visibility === 'invite_only' ? (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {group.visibility.replace('_', ' ')}
              </span>
            </div>
            {group.description ? (
              <p className="mt-1 max-w-[56ch] text-sm text-[var(--pm-muted)]">{group.description}</p>
            ) : null}
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
            {membership ? (
              <span data-testid="circle-header-joined" className="contents">
                <GroupMembershipButton
                  slug={slug}
                  initialIsMember
                  isLoggedIn={Boolean(currentUserId)}
                  joinedLabel="✓ Joined"
                />
              </span>
            ) : (
              <GroupMembershipButton
                slug={slug}
                initialIsMember={false}
                isLoggedIn={Boolean(currentUserId)}
              />
            )}
          </div>
        </div>
        {/* Stat trio below the divider, per reference: members · posts this
            month · solved rate, with — when there are no questions yet. */}
        <div
          data-testid="circle-header-stats"
          className="mt-4 flex items-center gap-7 border-t border-[var(--pm-line)] pt-4"
        >
          <BannerStat value={group.memberCount.toLocaleString()} label="Members" />
          <BannerStat value={stats.postsThisMonth.toLocaleString()} label="Posts / mo" />
          <BannerStat
            teal
            value={stats.solvedRate !== null ? formatPercent(stats.solvedRate) : '—'}
            label="Solved rate"
          />
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
        variant="compact"
        checklistSlot={
          circleContent ? <CircleHowItWorks content={circleContent.howItWorks} /> : undefined
        }
        emptySlot={
          circleContent ? (
            <CircleEmptyState content={circleContent.emptyState} composeHref={composeHref} />
          ) : undefined
        }
        listFooterSlot={
          circleContent ? (
            <CircleListFooter text={circleContent.seededFooter} composeHref={composeHref} />
          ) : undefined
        }
        railSlot={
          <>
            {circleContent ? <CircleChecklistCard content={circleContent.checklist} /> : null}
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
