import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listFeed } from '@/lib/services/posts';
import { listGlobalLeaderboard, getWritableGroups } from '@/lib/services/community';
import { FeedPage } from '../components/FeedPage';
import { FeedFilter } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function FeedRoute({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const filterParam = typeof params.filter === 'string' ? params.filter : undefined;
  const filter: FeedFilter = Object.values(FeedFilter).includes(filterParam as FeedFilter)
    ? (filterParam as FeedFilter)
    : FeedFilter.ALL;

  const pageParam = typeof params.page === 'string' ? Number(params.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const [{ posts, nextCursor }, leaderboard, writableGroups] = await Promise.all([
    listFeed(db, { filter, sort: 'new', page, limit: 20 }, currentUserId),
    listGlobalLeaderboard(db, 'weekly', 5),
    currentUserId ? getWritableGroups(db, currentUserId) : Promise.resolve([]),
  ]);

  return (
    <FeedPage
      initialPosts={posts}
      initialFilter={filter}
      initialCursor={nextCursor}
      currentUserId={currentUserId}
      writableGroups={writableGroups}
      leaderboard={leaderboard}
    />
  );
}
