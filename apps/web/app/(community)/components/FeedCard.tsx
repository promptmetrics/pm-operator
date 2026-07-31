'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, Flag, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
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

export function FeedCard({ post, currentUserId, rank, onClickResult }: FeedCardProps) {
  const [liked, setLiked] = React.useState(false);
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
      setLikeCount(removed ? previous : previous + 1);
    } catch {
      setLiked((l) => !l);
      setLikeCount(previous);
    } finally {
      setToggling(false);
    }
  };

  return (
    <article aria-labelledby={`post-title-${post.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/g/${post.group.slug}`}>
              <Badge variant="outline">{post.group.name}</Badge>
            </Link>
            {post.isSolved ? (
              <Badge variant="emerald" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Solved
              </Badge>
            ) : null}
            {rank ? (
              <span className="text-xs text-muted-foreground">#{rank}</span>
            ) : null}
          </div>

          <Link
            href={`/p/${post.id}`}
            onClick={() => onClickResult?.(post.id)}
            className="group block"
          >
            <h2
              id={`post-title-${post.id}`}
              className="text-lg font-semibold leading-tight group-hover:text-primary"
            >
              {post.title}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
                <Link href={`/u/${post.author.userslug}`} className="font-medium hover:text-primary">
                  {post.author.username}
                </Link>
                <span className="text-muted-foreground">
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
                  className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`}
                  aria-hidden="true"
                />
                <span className="text-xs">{formatNumber(likeCount)}</span>
              </Button>

              <Link href={`/p/${post.id}`}>
                <Button variant="ghost" size="sm" className="gap-1">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs">{formatNumber(post.commentCount)}</span>
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                aria-label="Flag post"
                disabled={!currentUserId}
                onClick={() => alert('Flag reason dialog not implemented in this preview')}
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
              </Button>
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
