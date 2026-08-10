import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { searchPosts } from '@/lib/services/search';
import { SearchPage, type SearchScope } from '../components/SearchPage';
import { SearchSort, type PostType } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

// Type-filter chips (utility-screens reference): All / Questions / Builds /
// Solved only. `type` and `solved` mirror the /api/v1/search params.
function parseScope(params: PageSearchParams): {
  scope: SearchScope;
  postType?: PostType;
  solvedOnly: boolean;
} {
  if (params.solved === 'true') return { scope: 'solved', solvedOnly: true };
  if (params.type === 'question') return { scope: 'questions', postType: 'question', solvedOnly: false };
  if (params.type === 'build') return { scope: 'builds', postType: 'build', solvedOnly: false };
  return { scope: 'all', solvedOnly: false };
}

export default async function SearchRoute({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const sortParam = typeof params.sort === 'string' ? params.sort : undefined;
  const sort: SearchSort = Object.values(SearchSort).includes(sortParam as SearchSort)
    ? (sortParam as SearchSort)
    : SearchSort.RELEVANCE;
  const pageParam = typeof params.page === 'string' ? Number(params.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;
  const { scope, postType, solvedOnly } = parseScope(params);

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const { results, nextCursor } = query
    ? await searchPosts(db, { q: query, sort, page, limit: 20 }, currentUserId, postType, solvedOnly)
    : { results: [], nextCursor: undefined };

  return (
    <SearchPage
      initialQuery={query}
      initialSort={sort}
      initialScope={scope}
      initialResults={results}
      initialCursor={nextCursor}
      currentUserId={currentUserId}
    />
  );
}
