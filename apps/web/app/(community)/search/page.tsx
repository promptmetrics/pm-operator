import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { searchPosts } from '@/lib/services/search';
import { SearchPage } from '../components/SearchPage';
import { SearchSort } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function SearchRoute({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const sortParam = typeof params.sort === 'string' ? params.sort : undefined;
  const sort: SearchSort = Object.values(SearchSort).includes(sortParam as SearchSort)
    ? (sortParam as SearchSort)
    : SearchSort.RELEVANCE;
  const pageParam = typeof params.page === 'string' ? Number(params.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const { results, nextCursor } = query
    ? await searchPosts(db, { q: query, sort, page, limit: 20 }, currentUserId)
    : { results: [], nextCursor: undefined };

  return (
    <SearchPage
      initialQuery={query}
      initialSort={sort}
      initialResults={results}
      initialCursor={nextCursor}
      currentUserId={currentUserId}
    />
  );
}
