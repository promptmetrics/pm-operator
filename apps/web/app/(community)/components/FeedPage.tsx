'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trophy, TrendingUp, Users } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent, CardTitle } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { useToast } from '@pm-operator/ui/components/Toast';
import { FeedCard } from './FeedCard';
import { CreatePostModal } from './CreatePostModal';
import { useRealtimeGroup } from './RealtimeProvider';
import type { FeedFilter, PostListItem, Group, LeaderboardEntry } from '@pm-operator/api';
import { POINT_WEIGHTS } from '@pm-operator/api';

interface FeedPageProps {
  initialPosts: PostListItem[];
  initialFilter: FeedFilter;
  initialCursor?: string;
  currentUserId?: string;
  writableGroups: Group[];
  leaderboard: LeaderboardEntry[];
  groupSlug?: string;
}

const FILTERS: { label: string; value: FeedFilter; icon?: React.ReactNode }[] = [
  { label: 'All', value: 'all' },
  { label: 'My circles', value: 'my-circles' },
  { label: 'Show your build', value: 'builds' },
  { label: 'Solutions', value: 'solutions' },
  { label: 'Unanswered', value: 'unanswered' },
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
  const [page, setPage] = React.useState<number>(() => {
    const initialPage = Number(searchParams.get('page') || '1');
    return Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1;
  });
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialCursor);
    setPage(1);
  }, [initialPosts, initialCursor]);

  const changeFilter = (value: FeedFilter) => {
    setFilter(value);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
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
      const nextPage = page + 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set('filter', filter);
      if (groupSlug) params.set('groupSlug', groupSlug);
      params.set('page', String(nextPage));
      const endpoint = `/api/v1/feed?${params.toString()}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to load more');
      const json = (await res.json()) as { data?: { posts: PostListItem[] }; meta?: { hasMore?: boolean } };
      const next = json.data?.posts ?? [];
      setPosts((prev) => [...prev, ...next]);
      setPage(nextPage);
      setCursor(json.meta?.hasMore ? next[next.length - 1]?.createdAt : undefined);
    } catch (err: any) {
      toast({ title: err.message || 'Failed to load more', variant: 'error' });
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
          group: { slug: detail.group.slug, name: detail.group.name, color: detail.group.color },
          author: {
            userslug: detail.author.userslug,
            username: detail.author.username,
            reputationScore: detail.author.reputationScore,
            acceptedSolutions: detail.author.acceptedSolutions,
            level: detail.author.level,
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
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">
              {groupSlug ? 'Discussion' : 'Community feed'}
            </h1>
            <p className="text-sm text-[var(--pm-muted)]">
              {groupSlug ? 'Posts from this circle' : 'Questions, builds, and solutions from operators'}
            </p>
          </div>
          {currentUserId && writableGroups.length > 0 ? (
            <Button onClick={() => setCreateOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New post
            </Button>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => changeFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)] shadow-[var(--pm-shadow)]'
                    : 'bg-[var(--pm-paper-inset)] text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div role="feed" aria-label={groupSlug ? 'Circle discussion' : 'Community feed'} className="flex flex-col gap-4">
          {posts.map((post) => (
            <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
            <p className="font-serif text-lg font-medium text-[var(--pm-ink)]">{emptyTitle(filter, !!groupSlug)}</p>
            <p className="mt-1 text-sm text-[var(--pm-muted)]">{emptyBody(filter)}</p>
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

      <aside className="flex flex-col gap-4">
        <Card>
          <CardContent className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-[var(--pm-coral)]" aria-hidden="true" />
              Top operators this week
            </CardTitle>
            {leaderboard.length > 0 ? (
              <ol className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <li key={entry.userslug} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[var(--pm-ink)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pm-paper-2)] text-xs font-medium text-[var(--pm-muted)]">
                        {index + 1}
                      </span>
                      {entry.username}
                    </span>
                    <span className="font-medium text-[var(--pm-coral)]">{entry.score}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-[var(--pm-muted)]">No leaderboard data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[var(--pm-coral)]" aria-hidden="true" />
              How to level up
            </CardTitle>
            <ul className="space-y-2 text-sm text-[var(--pm-muted)]">
              <li className="flex items-start gap-2">
                <span className="text-[var(--pm-green)]">+{POINT_WEIGHTS.topic_created}</span>
                <span>Share a build or ask a question</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--pm-green)]">+{POINT_WEIGHTS.comment_created}</span>
                <span>Leave a helpful comment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--pm-green)]">+{POINT_WEIGHTS.solution_accepted}</span>
                <span>Have your answer accepted as a solution</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {!currentUserId ? (
          <Card className="bg-[var(--pm-coral)] text-[var(--pm-on-ink)]">
            <CardContent className="space-y-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" aria-hidden="true" />
                Join the community
              </CardTitle>
              <p className="text-sm opacity-90">
                Sign in to post, join circles, and climb the operator leaderboard.
              </p>
              <Button variant="secondary" className="w-full" asChild>
                <a href="/login">Create account</a>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </aside>

      <CreatePostModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={writableGroups}
        defaultGroupSlug={groupSlug}
        onCreated={() => {
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
