'use client';

import * as React from 'react';
import Link from 'next/link';
import { MessageSquare, Award, FileText } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { FeedCard } from './FeedCard';
import { timeAgo } from '@/lib/format';
import type { PublicUserProfile, PostListItem, CommentDetail, UserBadgesResponse } from '@pm-operator/api';
import type { AcceptedSolutionItem } from '@/lib/services/community';

type Tab = 'posts' | 'solutions' | 'comments';

const MAX_BADGE_CHIPS = 4;

interface ProfileTabsProps {
  user: PublicUserProfile;
  currentUserId?: string;
  posts: PostListItem[];
  solutions: AcceptedSolutionItem[];
  comments: CommentDetail[];
  badges: UserBadgesResponse;
}

export function ProfileTabs({ user, currentUserId, posts, solutions, comments, badges }: ProfileTabsProps) {
  const [tab, setTab] = React.useState<Tab>('posts');
  const isMe = currentUserId === user.id;

  return (
    <div className="mx-auto max-w-4xl">
      <Card className="mb-6 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar
            src={user.pictureUrl ?? undefined}
            alt={user.username}
            fallback={user.fullName || user.username}
            size="xl"
          />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{user.fullName || user.username}</h1>
            <p className="text-[var(--pm-muted)]">@{user.userslug}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-[var(--pm-muted)]">
              <span>{user.reputationScore} reputation</span>
              <span>·</span>
              <span>{user.acceptedSolutions} solutions</span>
              <span>·</span>
              <span>{user.streakDays}-day streak</span>
            </div>
            {badges.earned.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badges.earned.slice(0, MAX_BADGE_CHIPS).map(({ badge }) => (
                  <Badge key={badge.id} variant="coral">{badge.name}</Badge>
                ))}
                {badges.earned.length > MAX_BADGE_CHIPS ? (
                  <Badge variant="outline">+{badges.earned.length - MAX_BADGE_CHIPS} more</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          {isMe ? (
            <Button variant="secondary" asChild>
              <Link href="/settings">Edit profile</Link>
            </Button>
          ) : null}
        </div>
      </Card>

      {badges.earned.length > 0 || badges.progress.length > 0 ? (
        <Card className="mb-6 p-6">
          <h2 className="mb-3 font-serif text-lg font-semibold text-[var(--pm-ink)]">Achievements</h2>
          <ul className="space-y-2 text-sm">
            {badges.earned.map(({ badge, awardedAt }) => (
              <li key={badge.id} className="flex items-center gap-2">
                <span className="text-[var(--pm-green)]" aria-hidden="true">✓</span>
                <span className="text-[var(--pm-ink)]">{badge.name}</span>
                <span className="ml-auto text-xs text-[var(--pm-muted)]">{timeAgo(awardedAt)}</span>
              </li>
            ))}
            {badges.progress.map(({ badge, current, threshold }) => (
              <li key={badge.id} className="flex items-center gap-2">
                <span className="text-[var(--pm-muted)]" aria-hidden="true">○</span>
                <span className="text-[var(--pm-muted)]">{badge.name}</span>
                <span className="ml-auto text-xs text-[var(--pm-muted)]">
                  {current}/{threshold}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {<TabButton tab="posts" label="Posts" icon={FileText} active={tab} onClick={setTab} count={posts.length} />}
        {<TabButton tab="solutions" label="Solutions" icon={Award} active={tab} onClick={setTab} count={solutions.length} />}
        {<TabButton tab="comments" label="Comments" icon={MessageSquare} active={tab} onClick={setTab} count={comments.length} />}
      </div>

      {tab === 'posts' ? (
        posts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
            ))}
          </div>
        ) : (
          <EmptyState message="No posts yet." />
        )
      ) : null}

      {tab === 'solutions' ? (
        solutions.length > 0 ? (
          <div className="flex flex-col gap-4">
            {solutions.map((item) => (
              <Card key={item.id} className="p-4">
                <Link
                  href={`/p/${item.post.id}`}
                  className="mb-2 block font-medium hover:text-[var(--pm-coral-dark)]"
                >
                  {item.post.title}
                </Link>
                <div
                  className="prose prose-sm max-w-none text-[var(--pm-muted)]"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--pm-muted)]">
                  <Badge variant="outline">{item.post.group.name}</Badge>
                  <span>{timeAgo(item.createdAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState message="No accepted solutions yet." />
        )
      ) : null}

      {tab === 'comments' ? (
        comments.length > 0 ? (
          <div className="flex flex-col gap-3">
            {comments.map((comment) => (
              <Card key={comment.id} className="p-4">
                <Link
                  href={`/p/${comment.postId}`}
                  className="mb-2 block text-sm font-medium hover:text-[var(--pm-coral-dark)]"
                >
                  Commented on a post
                </Link>
                <div
                  className="prose prose-sm max-w-none text-[var(--pm-muted)]"
                  dangerouslySetInnerHTML={{ __html: comment.content }}
                />
                <p className="mt-2 text-xs text-[var(--pm-muted)]">{timeAgo(comment.createdAt)}</p>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState message="No comments yet." />
        )
      ) : null}
    </div>
  );
}

function TabButton({
  tab,
  label,
  icon: Icon,
  active,
  onClick,
  count,
}: {
  tab: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: Tab;
  onClick: (tab: Tab) => void;
  count: number;
}) {
  return (
    <Button
      variant={active === tab ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => onClick(tab)}
      className="gap-1"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      <span className="ml-1 rounded-full bg-[var(--pm-paper)] px-1.5 text-xs">{count}</span>
    </Button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
      <p className="text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}
