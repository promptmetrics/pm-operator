'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';
import { FeedCard } from './FeedCard';
import type { PostListItem } from '@pm-operator/api';

interface BookmarksPageProps {
  initialPosts: PostListItem[];
  initialHasMore: boolean;
  currentUserId: string;
}

export function BookmarksPage({ initialPosts, initialHasMore, currentUserId }: BookmarksPageProps) {
  const [posts, setPosts] = React.useState<PostListItem[]>(initialPosts);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const loadMore = async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/v1/me/bookmarks?page=${nextPage}&limit=20`);
      if (!res.ok) throw new Error('Failed to load more');
      const json = (await res.json()) as {
        data?: { posts: PostListItem[] };
        meta?: { hasMore?: boolean };
      };
      const next = json.data?.posts ?? [];
      setPosts((prev) => [...prev, ...next]);
      setPage(nextPage);
      setHasMore(Boolean(json.meta?.hasMore));
    } catch (err: any) {
      toast({ title: err.message || 'Failed to load more', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">Bookmarks</h1>
        <p className="text-sm text-[var(--pm-muted)]">Posts you saved for later</p>
      </div>

      {posts.length > 0 ? (
        <div className="divide-y divide-[var(--pm-line)] overflow-hidden rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]">
          {posts.map((post) => (
            <FeedCard key={post.id} post={post} currentUserId={currentUserId} variant="row" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
          <p className="font-serif text-lg font-medium text-[var(--pm-ink)]">No bookmarks yet</p>
          <p className="mt-1 text-sm text-[var(--pm-muted)]">
            Use the bookmark action on any post to save it here.
          </p>
        </div>
      )}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore} disabled={loading} variant="secondary">
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
