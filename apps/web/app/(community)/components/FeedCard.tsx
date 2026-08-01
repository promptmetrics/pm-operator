'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, Flag, CheckCircle2, Wrench, Rocket } from 'lucide-react';
import { FlagDialog } from './FlagDialog';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Tag } from '@pm-operator/ui/components/Tag';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Button } from '@pm-operator/ui/components/Button';
import { timeAgo, formatNumber } from '@/lib/format';
import type { PostListItem, SearchResult } from '@pm-operator/api';

type PostItem = PostListItem | SearchResult;

interface FeedCardProps {
  post: PostItem;
  currentUserId?: string;
  rank?: number;
  onClickResult?: (postId: string) => void;
}

const CATEGORY_COLORS = [
  'var(--pm-cat-sales)',
  'var(--pm-cat-education)',
  'var(--pm-cat-finance)',
  'var(--pm-cat-marketing)',
  'var(--pm-cat-professional)',
];

function groupColor(post: PostItem): string {
  if (post.group.color) return post.group.color;
  let hash = 0;
  for (let i = 0; i < post.group.slug.length; i++) {
    hash = post.group.slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

export function FeedCard({ post, currentUserId, rank, onClickResult }: FeedCardProps) {
  const [liked, setLiked] = React.useState(Boolean(post.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(post.upvotes);
  const [toggling, setToggling] = React.useState(false);

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
      if (!res.ok) throw new Error('Like failed');
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous - 1 : previous + 1);
    } catch {
      setLiked((l) => !l);
      setLikeCount(previous);
    } finally {
      setToggling(false);
    }
  };

  const isBuild = post.type === 'build';
  const categoryColor = groupColor(post);

  return (
    <article aria-labelledby={`post-title-${post.id}`}>
      <Card className="transition-shadow hover:shadow-[var(--pm-shadow-lg)]">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/g/${post.group.slug}`}>
              <Tag color={categoryColor}>{post.group.name}</Tag>
            </Link>
            {post.isSolved ? (
              <Badge variant="green" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Solved
              </Badge>
            ) : null}
            {isBuild ? (
              <Badge variant="coral" className="gap-1">
                <Rocket className="h-3 w-3" aria-hidden="true" />
                Build
              </Badge>
            ) : null}
            {post.type === 'question' ? (
              <Badge variant="blue" className="gap-1">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                Question
              </Badge>
            ) : null}
            {rank ? (
              <span className="text-xs text-[var(--pm-muted)]">#{rank}</span>
            ) : null}
          </div>

          <Link
            href={`/p/${post.id}`}
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
              {post.tags.map((t) => `#${t}`).join(' ') || excerpt(post.title)}
            </p>
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href={`/u/${post.author.userslug}`}>
                <Avatar
                  alt={post.author.username}
                  fallback={post.author.username}
                  size="xs"
                />
              </Link>
              <div className="flex flex-col text-xs">
                <Link href={`/u/${post.author.userslug}`} className="font-medium text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]">
                  {post.author.username}
                </Link>
                <span className="text-[var(--pm-muted-soft)]">
                  {post.author.reputationScore} pts · {post.author.acceptedSolutions} solutions · {timeAgo(post.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={liked ? 'Unlike' : 'Like'}
                aria-pressed={liked}
                onClick={handleLike}
                disabled={!currentUserId || toggling}
                className="gap-1"
              >
                <Heart
                  className={`h-4 w-4 ${liked ? 'fill-[var(--pm-coral)] text-[var(--pm-coral)]' : 'text-[var(--pm-muted)]'}`}
                  aria-hidden="true"
                />
                <span className="text-xs text-[var(--pm-muted)]">{formatNumber(likeCount)}</span>
              </Button>

              <Link href={`/p/${post.id}`}>
                <Button variant="ghost" size="sm" className="gap-1">
                  <MessageSquare className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
                  <span className="text-xs text-[var(--pm-muted)]">{formatNumber(post.commentCount)}</span>
                </Button>
              </Link>

              <FlagDialog targetType="post" targetId={post.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Flag post"
                  disabled={!currentUserId}
                >
                  <Flag className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
                </Button>
              </FlagDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </article>
  );
}

function excerpt(title: string): string {
  return title.length > 100 ? title.slice(0, 100) + '…' : title;
}
