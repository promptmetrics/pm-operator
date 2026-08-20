'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Flag,
  CheckCircle2,
  Wrench,
  Rocket,
  MoreHorizontal,
  Star,
  Pin,
} from 'lucide-react';
import { FlagDialog } from './FlagDialog';
import { LinkPreviewCard } from './LinkPreviewCard';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Button } from '@pm-operator/ui/components/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@pm-operator/ui/components/DropdownMenu';
import { useToast } from '@pm-operator/ui/components/Toast';
import { formatNumber } from '@/lib/format';
import { TimeAgo } from '@/components/TimeAgo';
import { apiErrorMessage } from '@/lib/api/client-errors';
import type { PostListItem, SearchResult } from '@pm-operator/api';

type PostItem = PostListItem | SearchResult;

// Action-row pills (reference: "▲ 14" · "💬 3" · "◈") — same class recipe as
// the post-detail pills.
const pillClass =
  'inline-flex h-[var(--pm-control-h)] items-center gap-1.5 rounded-[var(--pm-radius-pill)] border bg-[var(--pm-paper)] px-3 text-[13px] transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:pointer-events-none disabled:opacity-60';
const pillIdle =
  'border-[var(--pm-line)] text-[var(--pm-muted)] hover:border-[var(--pm-coral)] hover:text-[var(--pm-coral-dark)]';
const pillActive = 'border-[var(--pm-coral)] bg-[var(--pm-coral-tint)] text-[var(--pm-coral-dark)]';

interface FeedCardProps {
  post: PostItem;
  currentUserId?: string;
  rank?: number;
  onClickResult?: (postId: string) => void;
  /**
   * Overrides the post's own featuredLabel for the inline featured badge
   * (FeedPage passes a "Featured" fallback for the highlight slot).
   */
  featuredLabel?: string | null;
  /**
   * Renders the inline "Pinned" badge in the chips row. A prop rather than a
   * post field because PostListItem carries no isPinned — FeedPage's highlight
   * slot is what knows a post is pinned.
   */
  pinned?: boolean;
}

const CATEGORY_COLORS = [
  'var(--pm-cat-sales)',
  'var(--pm-cat-education)',
  'var(--pm-cat-finance)',
  'var(--pm-cat-marketing)',
  'var(--pm-cat-professional)',
];

// Near-black group colors (e.g. #000000 from seeded test data) render as an
// unreadable dark chip; fall back to the tinted palette instead.
function isUnsafeDark(color: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 70;
}

function groupColor(post: PostItem): string {
  if (post.group.color && !isUnsafeDark(post.group.color)) return post.group.color;
  let hash = 0;
  for (let i = 0; i < post.group.slug.length; i++) {
    hash = post.group.slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

export function FeedCard({
  post,
  currentUserId,
  rank,
  onClickResult,
  featuredLabel,
  pinned,
}: FeedCardProps) {
  const [liked, setLiked] = React.useState(Boolean(post.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(post.upvotes);
  const [toggling, setToggling] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState(Boolean(post.viewerHasBookmarked));
  const [bookmarking, setBookmarking] = React.useState(false);
  const flagTriggerRef = React.useRef<HTMLButtonElement>(null);
  const { toast } = useToast();

  // Flag lives in the "…" overflow (D4); the sr-only FlagDialog trigger is
  // clicked from the menu item so the dialog survives the menu closing —
  // same pattern as PostDetailPage.
  const overflowMenu = currentUserId ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Post actions">
            <MoreHorizontal className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTimeout(() => flagTriggerRef.current?.click(), 0)}>
            <Flag className="h-4 w-4" aria-hidden="true" />
            Flag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FlagDialog targetType="post" targetId={post.id}>
        <button ref={flagTriggerRef} type="button" tabIndex={-1} className="sr-only">
          Flag post
        </button>
      </FlagDialog>
    </>
  ) : null;

  const handleBookmark = async () => {
    if (!currentUserId || bookmarking) return;
    setBookmarking(true);
    const previous = bookmarked;
    setBookmarked(!previous);

    try {
      const res = await fetch('/api/v1/bookmarks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });
      if (!res.ok) throw new Error('Bookmark failed');
      const json = (await res.json()) as { data?: { bookmarked?: boolean } };
      setBookmarked(Boolean(json.data?.bookmarked));
    } catch {
      setBookmarked(previous);
      toast({ title: 'Bookmark failed', variant: 'error' });
    } finally {
      setBookmarking(false);
    }
  };

  const handleLike = async () => {
    if (!currentUserId || toggling) return;
    setToggling(true);
    const previous = likeCount;
    const next = liked ? previous - 1 : previous + 1;
    setLiked((l) => !l);
    setLikeCount(next);

    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: post.id, reactionType: 'like' }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Like failed'));
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous - 1 : previous + 1);
    } catch (err: any) {
      setLiked((l) => !l);
      setLikeCount(previous);
      toast({ title: err.message || 'Like failed', variant: 'error' });
    } finally {
      setToggling(false);
    }
  };

  const isBuild = post.type === 'build';
  const isUnanswered = post.type === 'question' && !post.isSolved;
  const categoryColor = groupColor(post);
  const inlineFeaturedLabel = featuredLabel ?? post.featuredLabel ?? null;

  return (
    <article aria-labelledby={`post-title-${post.id}`}>
      <Card className="transition-shadow hover:shadow-[var(--pm-shadow-lg)]">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* Reference pattern: circle is a plain colored text link; the
                type chip beside it carries the tint. */}
            <Link
              href={`/g/${post.group.slug}`}
              className="text-[12.5px] font-semibold hover:underline"
              style={{ color: categoryColor }}
            >
              {post.group.name}
            </Link>
            {post.type === 'question' ? (
              <Badge variant="blue" className="gap-1">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                Question
              </Badge>
            ) : null}
            {isBuild ? (
              <Badge variant="coral" className="gap-1">
                <Rocket className="h-3 w-3" aria-hidden="true" />
                Build
              </Badge>
            ) : null}
            {post.isSolved ? (
              <Badge variant="teal" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Solved
              </Badge>
            ) : null}
            {isUnanswered ? <Badge variant="amber">Unanswered</Badge> : null}
            {inlineFeaturedLabel ? (
              <Badge variant="coral" className="gap-1">
                <Star className="h-3 w-3" aria-hidden="true" />
                {inlineFeaturedLabel}
              </Badge>
            ) : null}
            {pinned ? (
              <Badge variant="coral" className="gap-1">
                <Pin className="h-3 w-3" aria-hidden="true" />
                Pinned
              </Badge>
            ) : null}
            {rank ? (
              <span className="text-xs text-[var(--pm-muted)]">#{rank}</span>
            ) : null}
          </div>

          <Link
            href={`/g/${post.group.slug}/${post.slug}`}
            onClick={() => onClickResult?.(post.id)}
            className="group block"
          >
            <h2
              id={`post-title-${post.id}`}
              className="font-serif text-xl font-semibold leading-tight text-[var(--pm-ink)] group-hover:text-[var(--pm-coral-dark)]"
            >
              {post.title}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--pm-muted)]">
              {post.excerpt || post.tags.map((t) => `#${t}`).join(' ') || truncateTitle(post.title)}
            </p>
          </Link>

          {'coverImageUrl' in post && post.coverImageUrl ? (
            <Link href={`/g/${post.group.slug}/${post.slug}`} onClick={() => onClickResult?.(post.id)}>
              <img
                src={post.coverImageUrl}
                alt=""
                width={1200}
                height={600}
                loading="lazy"
                decoding="async"
                className="mt-3 aspect-[2/1] max-h-[240px] w-full rounded-lg border border-[var(--pm-line)] object-cover"
              />
            </Link>
          ) : null}

          {post.linkPreview ? <LinkPreviewCard preview={post.linkPreview} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <Link href={`/u/${post.author.userslug}`} className="shrink-0">
                <Avatar
                  alt={post.author.username}
                  fallback={post.author.username}
                  size="xs"
                />
              </Link>
              <div className="flex min-w-0 flex-col text-xs">
                <Link href={`/u/${post.author.userslug}`} className="truncate font-medium text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]">
                  {post.author.username}
                </Link>
                {/* No mid-word breaks at 375px: each meta group stays intact
                    and the line wraps between groups. */}
                <span className="text-[var(--pm-muted-soft)]">
                  <span className="whitespace-nowrap">Lv {post.author.level}</span>{' '}
                  ·{' '}
                  <span className="whitespace-nowrap">
                    {post.author.acceptedSolutions} solutions
                  </span>{' '}
                  · <TimeAgo iso={post.createdAt} className="whitespace-nowrap" />
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Bordered pill buttons per the reference: ▲ upvote, 💬 comments,
                  ◈ bookmark. Same handlers as before — visual only. */}
              <button
                type="button"
                aria-label={liked ? 'Unlike' : 'Like'}
                aria-pressed={liked}
                onClick={handleLike}
                disabled={!currentUserId || toggling}
                className={`${pillClass} font-mono text-xs font-semibold ${
                  liked ? pillActive : pillIdle
                }`}
              >
                <span aria-hidden="true">▲</span> {formatNumber(likeCount)}
              </button>

              <Link
                href={`/g/${post.group.slug}/${post.slug}`}
                className={`${pillClass} ${pillIdle}`}
              >
                <span aria-hidden="true">💬</span> {formatNumber(post.commentCount)}
              </Link>

              {currentUserId ? (
                <button
                  type="button"
                  aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  aria-pressed={bookmarked}
                  onClick={handleBookmark}
                  disabled={bookmarking}
                  className={`${pillClass} ${bookmarked ? pillActive : pillIdle}`}
                >
                  <span aria-hidden="true">◈</span>
                </button>
              ) : null}

              {overflowMenu}
            </div>
          </div>
        </CardContent>
      </Card>
    </article>
  );
}

// Fallback for list items served before `excerpt` shipped (cached payloads).
function truncateTitle(title: string): string {
  return title.length > 100 ? title.slice(0, 100) + '…' : title;
}
