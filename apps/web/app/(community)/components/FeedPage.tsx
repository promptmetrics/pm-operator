'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trophy, TrendingUp, Users, Pin, Star, Bookmark, FileText } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent, CardTitle } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Chip } from '@pm-operator/ui/components/Chip';
import { Select } from '@pm-operator/ui/components/Select';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { useToast } from '@pm-operator/ui/components/Toast';
import { FeedCard } from './FeedCard';
import { CreatePostModal } from './CreatePostModal';
import { useRealtimeGroup } from './RealtimeProvider';
import type {
  FeedFilter,
  FeedSort,
  PostType,
  PostListItem,
  Group,
  GroupWithPostCount,
  LeaderboardEntry,
} from '@pm-operator/api';
import { POINT_WEIGHTS } from '@pm-operator/api';

interface FeedPageProps {
  initialPosts: PostListItem[];
  initialFilter: FeedFilter;
  initialSort?: FeedSort;
  initialCursor?: string;
  currentUserId?: string;
  writableGroups: Group[];
  leaderboard: LeaderboardEntry[];
  groupSlug?: string;
  featuredPost?: PostListItem | null;
  pinnedPosts?: PostListItem[];
  /** Circles rail data (global feed only). */
  circles?: GroupWithPostCount[];
  totalCirclePosts?: number;
  /** Session user, for the composer strip avatar and rail shortcuts. */
  viewerUserslug?: string;
  viewerUsername?: string;
}

const FILTERS: { label: string; value: FeedFilter; swatch?: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'My circles', value: 'my-circles' },
  { label: 'Questions', value: 'questions' },
  { label: 'Builds', value: 'builds', swatch: 'var(--pm-cat-sales)' },
  { label: 'Solutions', value: 'solutions', swatch: 'var(--pm-green)' },
  { label: 'Unanswered', value: 'unanswered' },
];

const SORTS: { label: string; value: FeedSort }[] = [
  { label: 'Newest', value: 'new' },
  { label: 'Top', value: 'top' },
  { label: 'Trending', value: 'trending' },
];

export function FeedPage({
  initialPosts,
  initialFilter,
  initialSort = 'new',
  initialCursor,
  currentUserId,
  writableGroups,
  leaderboard,
  groupSlug,
  featuredPost,
  pinnedPosts,
  circles,
  totalCirclePosts,
  viewerUserslug,
  viewerUsername,
}: FeedPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = React.useState<FeedFilter>(initialFilter);
  const [sort, setSort] = React.useState<FeedSort>(initialSort);
  const [posts, setPosts] = React.useState<PostListItem[]>(initialPosts);
  const [cursor, setCursor] = React.useState<string | undefined>(initialCursor);
  const [page, setPage] = React.useState<number>(() => {
    const initialPage = Number(searchParams.get('page') || '1');
    return Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1;
  });
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [composerType, setComposerType] = React.useState<PostType>('question');
  const { toast } = useToast();

  const openComposer = (type: PostType) => {
    setComposerType(type);
    setCreateOpen(true);
  };

  React.useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialCursor);
    setPage(1);
  }, [initialPosts, initialCursor]);

  const routeWith = (nextFilter: FeedFilter, nextSort: FeedSort) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (nextFilter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', nextFilter);
    }
    if (nextSort === 'new') {
      params.delete('sort');
    } else {
      params.set('sort', nextSort);
    }
    const base = groupSlug ? `/g/${groupSlug}` : '/feed';
    const qs = params.toString();
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  };

  const changeFilter = (value: FeedFilter) => {
    setFilter(value);
    setPage(1);
    routeWith(value, sort);
  };

  const changeSort = (value: FeedSort) => {
    setSort(value);
    setPage(1);
    routeWith(filter, value);
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      // Explicit params only — don't leak arbitrary searchParams into the API.
      const params = new URLSearchParams();
      params.set('filter', filter);
      params.set('sort', sort);
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

  // Featured/pinned highlights only decorate the unfiltered global feed;
  // dedupe them from the regular list below.
  const showHighlights =
    filter === 'all' &&
    !groupSlug &&
    (Boolean(featuredPost) || (pinnedPosts ?? []).length > 0);
  const highlightIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (featuredPost) ids.add(featuredPost.id);
    for (const post of pinnedPosts ?? []) ids.add(post.id);
    return ids;
  }, [featuredPost, pinnedPosts]);
  const visiblePosts = showHighlights ? posts.filter((p) => !highlightIds.has(p.id)) : posts;

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

  const showLeftRail = !groupSlug && (circles ?? []).length > 0;
  const showComposer = !groupSlug && Boolean(currentUserId) && writableGroups.length > 0;

  return (
    <div
      className={`mx-auto grid max-w-6xl gap-6 ${
        showLeftRail
          ? 'lg:grid-cols-[230px_minmax(0,1fr)_320px]'
          : 'lg:grid-cols-[minmax(0,1fr)_320px]'
      }`}
    >
      {showLeftRail ? (
        <nav aria-label="Circles" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-6">
            <div>
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
                Circles
              </p>
              <ul className="flex flex-col gap-0.5">
                <li>
                  <Link
                    href="/g"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--pm-ink)] hover:bg-[var(--pm-paper-2)]"
                  >
                    <span>All circles</span>
                    <span className="text-xs text-[var(--pm-muted)]">{totalCirclePosts ?? 0}</span>
                  </Link>
                </li>
                {(circles ?? []).map((circle) => (
                  <li key={circle.slug}>
                    <Link
                      href={`/g/${circle.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: circle.color ?? 'var(--pm-muted-soft)' }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{circle.name}</span>
                      </span>
                      <span className="text-xs text-[var(--pm-muted)]">{circle.postCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {viewerUserslug ? (
              <div>
                <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
                  Shortcuts
                </p>
                <ul className="flex flex-col gap-0.5">
                  <li>
                    <Link
                      href={`/u/${viewerUserslug}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
                    >
                      <Bookmark className="h-3.5 w-3.5 text-[var(--pm-muted)]" aria-hidden="true" />
                      Bookmarks
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/u/${viewerUserslug}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--pm-muted)]" aria-hidden="true" />
                      My posts
                    </Link>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
        </nav>
      ) : null}

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
          {groupSlug && currentUserId && writableGroups.length > 0 ? (
            <Button onClick={() => openComposer('question')} className="gap-1">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New post
            </Button>
          ) : null}
        </div>

        {showComposer ? (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 shadow-[var(--pm-shadow)]">
            <Avatar alt={viewerUsername ?? 'You'} fallback={viewerUsername ?? undefined} size="sm" />
            <button
              type="button"
              onClick={() => openComposer('question')}
              className="min-w-0 flex-1 cursor-text truncate rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper)] px-4 py-2 text-left text-sm text-[var(--pm-muted-soft)]"
            >
              Ask a question or show your build…
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="secondary" onClick={() => openComposer('question')}>
                Question
              </Button>
              <Button onClick={() => openComposer('build')}>Show a build</Button>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.filter((f) => !(groupSlug && f.value === 'my-circles')).map((f) => (
            <Chip
              key={f.value}
              active={filter === f.value}
              swatch={f.swatch}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
            </Chip>
          ))}
          <div className="ml-auto">
            <Select
              aria-label="Sort posts"
              value={sort}
              onChange={(e) => changeSort(e.target.value as FeedSort)}
              className="h-[30px] w-auto py-0 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div role="feed" aria-label={groupSlug ? 'Circle discussion' : 'Community feed'} className="flex flex-col gap-4">
          {showHighlights && featuredPost ? (
            <div
              className="relative overflow-hidden rounded-xl"
              style={{ borderLeft: '3px solid var(--pm-cat-sales)' }}
            >
              <Badge variant="coral" className="absolute right-4 top-4 z-10 gap-1">
                <Star className="h-3 w-3" aria-hidden="true" />
                {featuredPost.featuredLabel ?? 'Featured'}
              </Badge>
              <FeedCard post={featuredPost} currentUserId={currentUserId} />
            </div>
          ) : null}
          {showHighlights
            ? (pinnedPosts ?? [])
                .filter((post) => post.id !== featuredPost?.id)
                .map((post) => (
                <div key={`pinned-${post.id}`} className="relative">
                  <Badge variant="coral" className="absolute right-4 top-4 z-10 gap-1">
                    <Pin className="h-3 w-3" aria-hidden="true" />
                    Pinned
                  </Badge>
                  <FeedCard post={post} currentUserId={currentUserId} />
                </div>
              ))
            : null}
          {visiblePosts.length > 0 ? (
            <div className="divide-y divide-[var(--pm-line)] overflow-hidden rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]">
              {visiblePosts.map((post) => (
                <FeedCard key={post.id} post={post} currentUserId={currentUserId} variant="row" />
              ))}
            </div>
          ) : null}
        </div>

        {visiblePosts.length === 0 && !showHighlights ? (
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
        defaultType={composerType}
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
