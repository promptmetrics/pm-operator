'use client';

import * as React from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Chip } from '@pm-operator/ui/components/Chip';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { StatCard } from '@pm-operator/ui/components/StatCard';
import { StreakGrid } from '@pm-operator/ui/components/StreakGrid';
import { Progress } from '@pm-operator/ui/components/Progress';
import { FeedCard } from './FeedCard';
import { timeAgo } from '@/lib/format';
import type {
  UserProfileDetail,
  CircleContribution,
  MyStreakResponse,
  PostListItem,
  CommentDetail,
  UserBadgesResponse,
} from '@pm-operator/api';
import type { AcceptedSolutionItem } from '@/lib/services/community';

type Tab = 'posts' | 'solutions' | 'comments' | 'bookmarks';

const MAX_BADGE_CHIPS = 4;

const railCardClass =
  'rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]';

const rowContainerClass =
  'divide-y divide-[var(--pm-line)] overflow-hidden rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]';

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface ProfileTabsProps {
  user: UserProfileDetail;
  currentUserId?: string;
  posts: PostListItem[];
  solutions: AcceptedSolutionItem[];
  comments: CommentDetail[];
  badges: UserBadgesResponse;
  bookmarks?: PostListItem[];
  circles: CircleContribution[];
  streak: MyStreakResponse | null;
}

export function ProfileTabs({
  user,
  currentUserId,
  posts,
  solutions,
  comments,
  badges,
  bookmarks,
  circles,
  streak,
}: ProfileTabsProps) {
  const [tab, setTab] = React.useState<Tab>('posts');
  const isMe = currentUserId === user.id;
  const { levelInfo } = user;

  return (
    <>
      <header className="-mx-4 -mt-6 mb-6 border-b border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar
            src={user.pictureUrl ?? undefined}
            alt={user.username}
            fallback={user.fullName || user.username}
            size="xl"
            className="h-[84px] w-[84px] text-xl"
            badge={
              <LevelBadge
                level={user.level}
                size="md"
                className="h-7 w-7 border-[3px] border-[var(--pm-paper-2)] text-xs"
              />
            }
          />
          <div className="flex-1">
            <h1 className="font-serif text-[28px] font-semibold leading-tight text-[var(--pm-ink)]">
              {user.fullName || user.username}
            </h1>
            <p className="mt-1 text-sm text-[var(--pm-muted)]">
              /u/{user.userslug} · Level {levelInfo.level} · {levelInfo.name} · joined{' '}
              {formatJoined(user.joinedAt)}
            </p>
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
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={user.reputationScore.toLocaleString()} label="Points" />
            <StatCard value={user.acceptedSolutions} label="Solutions" />
            <StatCard value={user.postsCount} label="Posts" />
            <StatCard
              value={user.streakDays}
              label="Day streak"
              icon={<Flame className="h-5 w-5" aria-hidden="true" />}
            />
          </div>

          <div className={railCardClass}>
            <div className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-bold text-[var(--pm-ink)]">
                Level {levelInfo.level} · {levelInfo.name}
              </span>
              <span className="text-[var(--pm-muted)]">
                {levelInfo.nextLevel && levelInfo.pointsToNext !== null
                  ? `${levelInfo.pointsToNext} pts to Level ${levelInfo.nextLevel.level} · ${levelInfo.nextLevel.name}`
                  : 'Max level'}
              </span>
            </div>
            <Progress value={levelInfo.progressPercent} />
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Chip active={tab === 'posts'} onClick={() => setTab('posts')}>
                Posts
              </Chip>
              <Chip
                active={tab === 'solutions'}
                swatch="var(--pm-green)"
                onClick={() => setTab('solutions')}
              >
                Solutions
              </Chip>
              <Chip active={tab === 'comments'} onClick={() => setTab('comments')}>
                Comments
              </Chip>
              {isMe ? (
                <Chip active={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
                  Bookmarks
                </Chip>
              ) : null}
            </div>

            {tab === 'posts' ? (
              posts.length > 0 ? (
                <div className={rowContainerClass}>
                  {posts.map((post) => (
                    <FeedCard key={post.id} post={post} currentUserId={currentUserId} variant="row" />
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

            {tab === 'bookmarks' && isMe ? (
              bookmarks && bookmarks.length > 0 ? (
                <div className={rowContainerClass}>
                  {bookmarks.map((post) => (
                    <FeedCard key={post.id} post={post} currentUserId={currentUserId} variant="row" />
                  ))}
                </div>
              ) : (
                <EmptyState message="No bookmarks yet." />
              )
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className={railCardClass}>
            <h2 className="mb-3 font-serif text-base font-semibold text-[var(--pm-ink)]">Streak</h2>
            {streak ? (
              <>
                <StreakGrid days={streak.days} />
                <p className="mt-2.5 text-xs text-[var(--pm-muted)]">
                  {streak.current > 0
                    ? `${streak.current} days and counting · best ${streak.best} · post or comment today to keep it alive`
                    : 'No streak yet — post or comment today to start one'}
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--pm-muted)]">
                No streak yet — post or comment today to start one
              </p>
            )}
          </section>

          {circles.length > 0 ? (
            <section className={railCardClass}>
              <h2 className="mb-3 font-serif text-base font-semibold text-[var(--pm-ink)]">Circles</h2>
              <ul className="space-y-2.5">
                {circles.map((circle) => (
                  <li key={circle.group.slug} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: circle.group.color ?? 'var(--pm-muted-soft)' }}
                    />
                    <Link
                      href={`/g/${circle.group.slug}`}
                      className="min-w-0 truncate text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                    >
                      {circle.group.name}
                    </Link>
                    {circle.acceptedSolutions > 0 ? (
                      <span className="ml-auto shrink-0 text-xs text-[var(--pm-muted)]">
                        {circle.acceptedSolutions} solutions
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {badges.earned.length > 0 || badges.progress.length > 0 ? (
            <section className={railCardClass}>
              <h2 className="mb-3 font-serif text-base font-semibold text-[var(--pm-ink)]">
                Achievements
              </h2>
              <ul className="space-y-2 text-sm">
                {badges.earned.map(({ badge }) => (
                  <li key={badge.id} className="flex items-center gap-2">
                    <span className="font-mono text-[var(--pm-green)]" aria-hidden="true">
                      ✓
                    </span>
                    <span className="text-[var(--pm-ink)]">{badge.name}</span>
                  </li>
                ))}
                {badges.progress.map(({ badge, current, threshold }) => (
                  <li key={badge.id} className="flex items-center gap-2">
                    <span className="font-mono text-[var(--pm-muted-soft)]" aria-hidden="true">
                      ○
                    </span>
                    <span className="text-[var(--pm-muted)]">{badge.name}</span>
                    <span className="ml-auto text-xs text-[var(--pm-muted)]">
                      ({current}/{threshold})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
      <p className="text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}
