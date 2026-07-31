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
import type { PublicUserProfile, PostListItem, CommentDetail } from '@pm-operator/api';
import type { AcceptedSolutionItem } from '@/lib/services/community';

type Tab = 'posts' | 'solutions' | 'comments';

interface ProfileTabsProps {
  user: PublicUserProfile;
  currentUserId?: string;
  posts: PostListItem[];
  solutions: AcceptedSolutionItem[];
  comments: CommentDetail[];
}

export function ProfileTabs({ user, currentUserId, posts, solutions, comments }: ProfileTabsProps) {
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
            <p className="text-muted-foreground">@{user.userslug}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span>{user.reputationScore} reputation</span>
              <span>·</span>
              <span>{user.acceptedSolutions} solutions</span>
              <span>·</span>
              <span>{user.streakDays}-day streak</span>
            </div>
          </div>
          {isMe ? (
            <Button variant="secondary" asChild>
              <Link href="/settings">Edit profile</Link>
            </Button>
          ) : null}
        </div>
      </Card>

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
                  className="mb-2 block font-medium hover:text-primary"
                >
                  {item.post.title}
                </Link>
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
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
                  className="mb-2 block text-sm font-medium hover:text-primary"
                >
                  Commented on a post
                </Link>
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: comment.content }}
                />
                <p className="mt-2 text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</p>
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
      <span className="ml-1 rounded-full bg-background px-1.5 text-xs">{count}</span>
    </Button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
