'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { FeedCard } from './FeedCard';
import { trackEvent } from '@/lib/analytics';
import type { SearchResult, SearchSort } from '@pm-operator/api';

interface SearchPageProps {
  initialQuery: string;
  initialSort: SearchSort;
  initialResults: SearchResult[];
  initialCursor?: string;
  currentUserId?: string;
}

export function SearchPage({
  initialQuery,
  initialSort,
  initialResults,
  initialCursor,
  currentUserId,
}: SearchPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(initialQuery);
  const [sort, setSort] = React.useState<SearchSort>(initialSort);
  const [results, setResults] = React.useState<SearchResult[]>(initialResults);
  const [cursor, setCursor] = React.useState<string | undefined>(initialCursor);
  const [page, setPage] = React.useState<number>(() => {
    const initialPage = Number(searchParams.get('page') || '1');
    return Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1;
  });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setQuery(initialQuery);
    setSort(initialSort);
    setResults(initialResults);
    setCursor(initialCursor);
    setPage(1);
  }, [initialQuery, initialSort, initialResults, initialCursor]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
    }
    params.delete('page');
    setPage(1);
    router.push(`/search?${params.toString()}`, { scroll: false });
  };

  const changeSort = (value: SearchSort) => {
    setSort(value);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', value);
    params.delete('page');
    router.push(`/search?${params.toString()}`, { scroll: false });
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', query);
      params.set('sort', sort);
      params.set('page', String(nextPage));
      const res = await fetch(`/api/v1/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const json = (await res.json()) as { data?: { results: SearchResult[] }; meta?: { hasMore?: boolean } };
      const next = json.data?.results ?? [];
      setResults((prev) => [...prev, ...next]);
      setPage(nextPage);
      setCursor(json.meta?.hasMore ? next[next.length - 1]?.createdAt : undefined);
    } catch (err: any) {
      alert(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold">Search</h1>

      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, questions, builds..."
            className="pl-9"
            aria-label="Search query"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>Search</Button>
      </form>

      <div className="mb-4 flex gap-2">
        {(['relevance', 'new', 'top'] as SearchSort[]).map((value) => (
          <Button
            key={value}
            variant={sort === value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => changeSort(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="flex flex-col gap-4">
          {results.map((post, index) => (
            <FeedCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              onClickResult={() => trackEvent('search_click', { query, position: index + 1 })}
            />
          ))}
        </div>
      ) : query ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-medium">No results for “{query}”</p>
          <p className="text-muted-foreground">Try a different term or tag.</p>
        </div>
      ) : null}

      {cursor ? (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore} disabled={loading} variant="secondary">
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
