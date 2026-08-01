import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listFeed, getFeaturedPost, listGlobalPinnedPosts } from '@/lib/services/posts';
import {
  listGlobalLeaderboard,
  getWritableGroups,
  listGroupsWithPostCounts,
} from '@/lib/services/community';
import { FeedPage } from '../components/FeedPage';
import { FeedFilter, FeedSort } from '@pm-operator/api';

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

  const [
    { posts, nextCursor },
    leaderboard,
    writableGroups,
    featuredPost,
    pinnedPosts,
    circlesWithCounts,
    viewer,
  ] = await Promise.all([
    listFeed(db, { filter, sort, page, limit: 20 }, currentUserId),
    listGlobalLeaderboard(db, 'weekly', 5),
    currentUserId ? getWritableGroups(db, currentUserId) : Promise.resolve([]),
    getFeaturedPost(db, currentUserId),
    listGlobalPinnedPosts(db, currentUserId),
    listGroupsWithPostCounts(db, currentUserId),
    currentUserId
      ? db.query.users.findFirst({
          where: eq(schema.users.id, currentUserId),
          columns: { userslug: true, username: true },
        })
      : Promise.resolve(null),
  ]);

  return (
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
      circles={circlesWithCounts.groups}
      totalCirclePosts={circlesWithCounts.totalPosts}
      viewerUserslug={viewer?.userslug}
      viewerUsername={viewer?.username}
    />
  );
}
