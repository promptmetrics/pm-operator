'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { FeedCard } from './FeedCard';
import { CreatePostModal } from './CreatePostModal';
import { useRealtimeGroup } from './RealtimeProvider';
import type { FeedFilter, PostListItem, Group, LeaderboardEntry } from '@pm-operator/api';

interface FeedPageProps {
  initialPosts: PostListItem[];
  initialFilter: FeedFilter;
  initialCursor?: string;
  currentUserId?: string;
  writableGroups: Group[];
  leaderboard: LeaderboardEntry[];
  groupSlug?: string;
}

const FILTERS: { label: string; value: FeedFilter }[] = [
  { label: 'My circles', value: 'my-circles' },
  { label: 'Show your build', value: 'builds' },
  { label: 'Solutions', value: 'solutions' },
  { label: 'Unanswered', value: 'unanswered' },
  { label: 'All', value: 'all' },
];

export function FeedPage({
  initialPosts,
  initialFilter,
  initialCursor,
  currentUserId,
  writableGroups,
  leaderboard,
  groupSlug,
}: FeedPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = React.useState<FeedFilter>(initialFilter);
  const [posts, setPosts] = React.useState<PostListItem[]>(initialPosts);
  const [cursor, setCursor] = React.useState<string | undefined>(initialCursor);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialCursor);
  }, [initialPosts, initialCursor]);

  const changeFilter = (value: FeedFilter) => {
    setFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', value);
    }
    const base = groupSlug ? `/g/${groupSlug}` : '/feed';
    router.push(`${base}?${params.toString()}`, { scroll: false });
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set('filter', filter);
      if (groupSlug) params.set('groupSlug', groupSlug);
      // Server-side feed uses page + limit; the client asks for the next page by incrementing page.
      const page = Number(params.get('page') || '1') + 1;
      params.set('page', String(page));
      const endpoint = groupSlug ? `/api/v1/feed?${params.toString()}` : `/api/v1/feed?${params.toString()}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to load more');
      const json = (await res.json()) as { data?: { posts: PostListItem[] }; meta?: { hasMore?: boolean } };
      const next = json.data?.posts ?? [];
      setPosts((prev) => [...prev, ...next]);
      setCursor(json.meta?.hasMore ? next[next.length - 1]?.createdAt : undefined);
    } catch (err: any) {
      alert(err.message || 'Failed to load more');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeGroup(
    async (postId) => {
      try {
        const res = await fetch(`/api/v1/posts/${postId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { data?: any };
        const detail = json.data;
        if (!detail) return;
        const item: PostListItem = {
          id: detail.id,
          title: detail.title,
          type: detail.type,
          status: detail.status,
          isSolved: detail.acceptedCommentId !== null,
          group: { slug: detail.group.slug, name: detail.group.name },
          author: {
            userslug: detail.author.userslug,
            username: detail.author.username,
            reputationScore: detail.author.reputationScore,
            acceptedSolutions: detail.author.acceptedSolutions,
          },
          upvotes: detail.upvotes,
          commentCount: detail.commentCount,
          viewCount: detail.viewCount,
          tags: detail.tags,
          createdAt: detail.createdAt,
        };
        setPosts((prev) => {
          if (prev.some((p) => p.id === item.id)) return prev;
          return [item, ...prev];
        });
      } catch {
        // ignore
      }
    },
    groupSlug
  );

  return (
    <div className="mx-auto max-w-5xl">
      {leaderboard.length > 0 ? (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">Top operators this week</p>
          <div className="flex flex-wrap items-center gap-3">
            {leaderboard.slice(0, 5).map((entry) => (
              <span key={entry.userslug} className="text-sm text-muted-foreground">
                {entry.rank}. {entry.username} ({entry.score})
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => changeFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{groupSlug ? 'Discussion' : 'Feed'}</h1>
        {currentUserId && writableGroups.length > 0 ? (
          <Button onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New post
          </Button>
        ) : null}
      </div>

      <div role="feed" aria-label={groupSlug ? 'Circle discussion' : 'Community feed'} className="flex flex-col gap-4">
        {posts.map((post) => (
          <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-medium">{emptyTitle(filter, !!groupSlug)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyBody(filter)}</p>
        </div>
      ) : null}

      {cursor ? (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore} disabled={loading} variant="secondary">
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <CreatePostModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={writableGroups}
        defaultGroupSlug={groupSlug}
        onCreated={() => {
          // Optimistic local refresh is handled by realtime; also bump page to first page.
          router.refresh();
        }}
      />
    </div>
  );
}

function emptyTitle(filter: FeedFilter, isGroup: boolean): string {
  if (isGroup) return 'No posts yet';
  switch (filter) {
    case 'my-circles':
      return 'No posts from your circles yet';
    case 'builds':
      return 'No builds shared yet';
    case 'unanswered':
      return 'All caught up';
    default:
      return 'No posts yet';
  }
}

function emptyBody(filter: FeedFilter): string {
  switch (filter) {
    case 'my-circles':
      return 'Be the first to ask a question or share a build.';
    case 'builds':
      return 'Operators learn from real shipped work.';
    case 'unanswered':
      return 'Every question in your circles has a response.';
    default:
      return 'Start a new discussion.';
  }
}
