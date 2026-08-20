import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listFeed, getFeaturedPost, listGlobalPinnedPosts } from '@/lib/services/posts';
import { listGlobalLeaderboard, getWritableGroups } from '@/lib/services/community';
import { getWeeklyDigest } from '@/lib/services/digest';
import {
  getOnboardingChecklistStatus,
  CHECKLIST_CIRCLE_TARGET,
} from '@/lib/services/onboarding';
import { FeedPage } from '../components/FeedPage';
import { WeeklyDigestBanner } from '../components/WeeklyDigestBanner';
import { WelcomeToast } from '../components/WelcomeToast';
import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { HelpSomeoneCard, getHelpQueue } from '../components/HelpSomeoneCard';
import { getPublicSiteUrl } from '@/lib/site-url';
import { buildWebSiteJsonLd } from '@/lib/seo/site-jsonld';
import { serializeJsonLd } from '@/lib/seo/post-jsonld';
import { FeedFilter, FeedSort } from '@pm-operator/api';

// /feed is the sitemap's priority-1.0 URL yet shipped with the root layout's
// generic title and no canonical — GSC filed it as "Duplicate without
// user-selected canonical". Static metadata is enough: the feed's identity
// doesn't vary by filter/sort, and the canonical deliberately ignores query
// params so every filtered view consolidates onto /feed.
const FEED_CANONICAL = `${getPublicSiteUrl()}/feed`;
const FEED_TITLE = 'Community feed — Operator Stack';
const FEED_DESCRIPTION =
  'Latest posts from the Operator Stack community — RevOps, CS, and marketing-ops operators sharing how they orchestrate their tools with coding agents.';

export const metadata: Metadata = {
  title: FEED_TITLE,
  description: FEED_DESCRIPTION,
  alternates: { canonical: FEED_CANONICAL },
  openGraph: {
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    url: FEED_CANONICAL,
    type: 'website',
  },
  twitter: { card: 'summary', title: FEED_TITLE, description: FEED_DESCRIPTION },
};

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function FeedRoute({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const filterParam = typeof params.filter === 'string' ? params.filter : undefined;
  const filter: FeedFilter = Object.values(FeedFilter).includes(filterParam as FeedFilter)
    ? (filterParam as FeedFilter)
    : FeedFilter.ALL;

  const sortParam = typeof params.sort === 'string' ? params.sort : undefined;
  const sort: FeedSort = Object.values(FeedSort).includes(sortParam as FeedSort)
    ? (sortParam as FeedSort)
    : FeedSort.NEW;

  const pageParam = typeof params.page === 'string' ? Number(params.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  // Bounded waves (≤2 concurrent): a single wide Promise.all starves the small
  // per-instance DB pool and hangs instead of queueing — abandoned clients then
  // pin pooler slots and wedge the database (2026-08-02 incident; see
  // DESIGN-GAP-REPORT "Pool-starvation gotcha"). The community layout now runs
  // one rail query concurrently with this page on every navigation, so page
  // waves stay at ≤2 to keep the request path within the pool of 3. The
  // circles-rail fetch itself moved to the layout (Phase 1 app shell).
  const [{ posts, nextCursor }, leaderboard] = await Promise.all([
    listFeed(db, { filter, sort, page, limit: 20 }, currentUserId),
    listGlobalLeaderboard(db, 'weekly', 5),
  ]);

  const [writableGroups, featuredPost] = await Promise.all([
    currentUserId ? getWritableGroups(db, currentUserId) : Promise.resolve([]),
    getFeaturedPost(db, currentUserId),
  ]);

  const [pinnedPosts, viewer] = await Promise.all([
    listGlobalPinnedPosts(db, currentUserId),
    currentUserId
      ? db.query.users.findFirst({
          where: eq(schema.users.id, currentUserId),
          columns: { username: true, preferences: true },
        })
      : Promise.resolve(null),
  ]);

  // getWeeklyDigest's own first wave is 2 concurrent queries — keep it alone.
  const digest = await getWeeklyDigest(db).catch(() => null);

  // Track 3C. Both are at most 1 query each, so this wave is 2 page-queries
  // wide like the ones above (+1 layout rail = the pool budget of 3).
  //   - getHelpQueue: unstable_cache(300s), viewer-independent → 0 queries on
  //     a cache hit, 1 on a miss.
  //   - getOnboardingChecklistStatus: 0 queries once preferences say
  //     dismissed/complete; otherwise 1 read (+1 sequential write on the single
  //     render that first reaches 3/3).
  const viewerPreferences = (viewer?.preferences as Record<string, unknown> | null) ?? null;
  const [helpQueue, checklist] = await Promise.all([
    getHelpQueue().catch(() => []),
    currentUserId
      ? getOnboardingChecklistStatus(db, currentUserId, viewerPreferences).catch(() => null)
      : Promise.resolve(null),
  ]);

  // T8.10: when a user lands here straight from finishing onboarding
  // (?welcome=1), surface a success toast naming the circles they joined
  // (stored in preferences by the step-2 action). "Write your first post" adds
  // &compose=1; since the composer is now its own page, redirect there.
  if (params.compose === '1') {
    redirect('/post/new');
  }

  const welcome = params.welcome === '1';
  const joinedNames =
    welcome && viewer
      ? ((viewerPreferences?.onboardingJoinedNames as string[]) ?? [])
      : [];

  return (
    <>
      {/* WebSite node for the subdomain, publisher-linked to www's Organization
          @id so the two graphs merge (see site-jsonld.ts). Emitted here because
          /feed is the entry page — `/` 308s to it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd(getPublicSiteUrl())),
        }}
      />
    <FeedPage
      initialPosts={posts}
      initialFilter={filter}
      initialSort={sort}
      initialCursor={nextCursor}
      currentUserId={currentUserId}
      writableGroups={writableGroups}
      leaderboard={leaderboard}
      featuredPost={featuredPost}
      pinnedPosts={pinnedPosts}
      viewerUsername={viewer?.username}
      digestBanner={digest ? <WeeklyDigestBanner digest={digest} /> : null}
      welcomeBanner={welcome ? <WelcomeToast names={joinedNames} /> : null}
      checklistSlot={
        checklist ? (
          <OnboardingChecklist
            circleCount={checklist.circleCount}
            hasPost={checklist.hasPost}
            hasComment={checklist.hasComment}
            circleTarget={CHECKLIST_CIRCLE_TARGET}
          />
        ) : null
      }
      railTopSlot={<HelpSomeoneCard items={helpQueue} />}
    />
    </>
  );
}
