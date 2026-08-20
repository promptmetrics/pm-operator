'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Chip } from '@pm-operator/ui/components/Chip';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { StreakGrid } from '@pm-operator/ui/components/StreakGrid';
import { Progress } from '@pm-operator/ui/components/Progress';
import { PostRow } from './PostRow';
import { TimeAgo } from '@/components/TimeAgo';
import type {
  UserProfileDetail,
  CircleContribution,
  MyStreakResponse,
  PostListItem,
  CommentDetail,
  UserBadgesResponse,
} from '@pm-operator/api';
import type { AcceptedSolutionItem } from '@/lib/services/community';
import type { CirclePointsSlice } from '@/lib/services/users';

type Tab = 'posts' | 'solutions' | 'comments' | 'bookmarks';

const MAX_BADGE_CHIPS = 4;
const MAX_BREAKDOWN_ROWS = 5;

const railCardClass =
  'rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]';

const railHeadingClass =
  'mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]';

const postListClass = 'flex flex-col gap-4';

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Fixed locale — this component server-renders first, so a host-dependent
 * number format would produce a hydration mismatch.
 */
function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

interface BreakdownRow {
  slug: string;
  name: string;
  color: string | null;
  points: number;
  /** null when the row comes from the ranking projection, which has no share. */
  share: number | null;
  acceptedSolutions: number;
}

/**
 * One list, two possible sources. The ledger breakdown (point_events grouped by
 * circle) is the honest answer to "where does this member earn?", so it wins.
 * Members whose points predate circle attribution have an empty ledger
 * breakdown but still have ranking rows, so those stand in rather than leaving
 * an empty card. Accepted-solution counts are merged in from the ranking rows
 * either way — no extra query, both payloads are already on the page.
 */
function breakdownRows(
  circlePoints: CirclePointsSlice[],
  circles: CircleContribution[]
): BreakdownRow[] {
  const solutionsBySlug = new Map(circles.map((c) => [c.group.slug, c.acceptedSolutions]));

  if (circlePoints.length > 0) {
    return circlePoints.slice(0, MAX_BREAKDOWN_ROWS).map((slice) => ({
      slug: slice.group.slug,
      name: slice.group.name,
      color: slice.group.color,
      points: slice.points,
      share: slice.share,
      acceptedSolutions: solutionsBySlug.get(slice.group.slug) ?? 0,
    }));
  }

  return circles.slice(0, MAX_BREAKDOWN_ROWS).map((circle) => ({
    slug: circle.group.slug,
    name: circle.group.name,
    color: circle.group.color,
    points: circle.score,
    share: null,
    acceptedSolutions: circle.acceptedSolutions,
  }));
}

interface ProfileTabsProps {
  user: UserProfileDetail;
  currentUserId?: string;
  isFollowing: boolean;
  posts: PostListItem[];
  solutions: AcceptedSolutionItem[];
  comments: CommentDetail[];
  badges: UserBadgesResponse;
  bookmarks?: PostListItem[];
  circles: CircleContribution[];
  circlePoints: CirclePointsSlice[];
  streak: MyStreakResponse | null;
}

export function ProfileTabs({
  user,
  currentUserId,
  isFollowing,
  posts,
  solutions,
  comments,
  badges,
  bookmarks,
  circles,
  circlePoints,
  streak,
}: ProfileTabsProps) {
  const [tab, setTab] = React.useState<Tab>('posts');
  const isMe = currentUserId === user.id;
  const { levelInfo } = user;
  const displayName = user.fullName || user.username;

  // Follow state (WS9): viewer-specific, toggled client-side via the follow
  // route. Counts come from the profile payload and refresh from the response.
  const [following, setFollowing] = React.useState(isFollowing);
  const [counts, setCounts] = React.useState({
    followerCount: user.followerCount,
    followingCount: user.followingCount,
  });
  const [followPending, setFollowPending] = React.useState(false);
  const [messagePending, setMessagePending] = React.useState(false);
  const router = useRouter();

  const rows = breakdownRows(circlePoints, circles);
  const ledgerBacked = circlePoints.length > 0;

  const toggleFollow = async () => {
    if (!currentUserId || isMe || followPending) return;
    setFollowPending(true);
    const method = following ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`/api/v1/users/${user.userslug}/follow`, { method });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: { following: boolean; followerCount: number; followingCount: number };
      };
      setFollowing(json.data.following);
      setCounts({
        followerCount: json.data.followerCount,
        followingCount: json.data.followingCount,
      });
    } finally {
      setFollowPending(false);
    }
  };

  // Start (or reuse) a 1:1 conversation with this user, then open the thread.
  const startConversation = async () => {
    if (!currentUserId || isMe || messagePending) return;
    setMessagePending(true);
    try {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: user.id }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { id: string } };
      if (json.data?.id) router.push(`/messages/${json.data.id}`);
    } finally {
      setMessagePending(false);
    }
  };

  return (
    <>
      {/* Clean header card per the redesign reference: white card, avatar
          with an ink level badge, serif name, level meta, bio. Stats and the
          level-progress bar live inside the same card. */}
      <header className="mx-auto mb-6 max-w-6xl rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar
            src={user.pictureUrl ?? undefined}
            alt={user.username}
            fallback={displayName}
            size="xl"
            className="h-[76px] w-[76px] shrink-0 text-xl"
            badge={
              <LevelBadge
                level={levelInfo.level}
                size="md"
                className="h-7 w-7 border-[3px] border-[var(--pm-paper-inset)] text-xs"
              />
            }
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-semibold leading-tight text-[var(--pm-ink)]">
              {displayName}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--pm-muted)]">
              Lv {levelInfo.level} · {levelInfo.name} · Joined {formatJoined(user.joinedAt)}
            </p>
            <p className="mt-1 text-[13px] text-[var(--pm-muted)]">
              /u/{user.userslug} ·{' '}
              {isMe ? (
                <Link
                  href={`/u/${user.userslug}/followers`}
                  className="hover:text-[var(--pm-coral-dark)] hover:underline"
                >
                  {formatNumber(counts.followerCount)} followers
                </Link>
              ) : (
                <span>{formatNumber(counts.followerCount)} followers</span>
              )}{' '}
              ·{' '}
              {isMe ? (
                <Link
                  href={`/u/${user.userslug}/following`}
                  className="hover:text-[var(--pm-coral-dark)] hover:underline"
                >
                  {formatNumber(counts.followingCount)} following
                </Link>
              ) : (
                <span>{formatNumber(counts.followingCount)} following</span>
              )}
            </p>
            {user.aboutMe ? (
              <p className="mt-2 max-w-[56ch] text-[13.5px] leading-relaxed text-[var(--pm-ink-2)]">
                {user.aboutMe}
              </p>
            ) : null}
          </div>
          {isMe ? (
            <Button variant="secondary" asChild className="shrink-0">
              <Link href="/settings">Edit profile</Link>
            </Button>
          ) : currentUserId ? (
            <div className="flex shrink-0 gap-2">
              <Button
                variant={following ? 'secondary' : 'primary'}
                onClick={toggleFollow}
                disabled={followPending}
              >
                {following ? 'Following' : 'Follow'}
              </Button>
              <Button variant="secondary" onClick={startConversation} disabled={messagePending}>
                Message
              </Button>
            </div>
          ) : null}
        </div>

        {badges.earned.length > 0 ? (
            <ul
              aria-label="Badges earned"
              data-testid="profile-badge-chips"
              className="mt-4 flex flex-wrap gap-2"
            >
              {badges.earned.slice(0, MAX_BADGE_CHIPS).map(({ badge, awardedAt }) => (
                <li
                  key={badge.id}
                  data-testid="profile-badge-chip"
                  title={`Earned ${formatJoined(awardedAt)}`}
                  className="inline-flex items-center gap-2 rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] py-1 pl-1 pr-3"
                >
                  {badge.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={badge.iconUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--pm-teal)_16%,transparent)] text-[11px] font-bold text-[var(--pm-teal-dark)]"
                    >
                      {badge.name.charAt(0)}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-[var(--pm-ink)]">{badge.name}</span>
                </li>
              ))}
              {badges.earned.length > MAX_BADGE_CHIPS ? (
                <li data-testid="profile-badge-chip-overflow" className="inline-flex items-center">
                  <Badge variant="outline">+{badges.earned.length - MAX_BADGE_CHIPS} more</Badge>
                </li>
              ) : null}
            </ul>
          ) : null}

        {/* Reference order: Points / Posts / Solutions / Streak — big number,
            plain label, no icons. */}
        <div
          role="list"
          aria-label="Profile stats"
          className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <ProfileStat value={formatNumber(user.reputationScore)} label="Points" />
          <ProfileStat value={formatNumber(user.postsCount)} label="Posts" />
          <ProfileStat value={formatNumber(user.acceptedSolutions)} label="Solutions" />
          <ProfileStat value={`${formatNumber(user.streakDays)}d`} label="Streak" />
        </div>

        <div className="mt-4" data-testid="level-progress">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[11.5px] text-[var(--pm-muted)]">
            <span>Level progress</span>
            <span>
              {levelInfo.nextLevel && levelInfo.pointsToNext !== null
                ? `${formatNumber(levelInfo.pointsToNext)} pts to Lv ${levelInfo.nextLevel.level}`
                : 'Max level'}
            </span>
          </div>
          <Progress
            value={levelInfo.progressPercent}
            aria-label={`Progress to level ${levelInfo.nextLevel?.level ?? levelInfo.level}`}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
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
                <div className={postListClass}>
                  {posts.map((post) => (
                    <PostRow key={post.id} post={post} />
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
                        href={`/g/${item.post.group.slug}/${item.post.slug}`}
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
                        <TimeAgo iso={item.createdAt} />
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
                        href={
                          comment.groupSlug && comment.postSlug
                            ? `/g/${comment.groupSlug}/${comment.postSlug}`
                            : `/p/${comment.postId}`
                        }
                        className="mb-2 block text-sm font-medium hover:text-[var(--pm-coral-dark)]"
                      >
                        Commented on a post
                      </Link>
                      <div
                        className="prose prose-sm max-w-none text-[var(--pm-muted)]"
                        dangerouslySetInnerHTML={{ __html: comment.content }}
                      />
                      <p className="mt-2 text-xs text-[var(--pm-muted)]">
                        <TimeAgo iso={comment.createdAt} />
                      </p>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyState message="No comments yet." />
              )
            ) : null}

            {tab === 'bookmarks' && isMe ? (
              bookmarks && bookmarks.length > 0 ? (
                <div className={postListClass}>
                  {bookmarks.map((post) => (
                    <PostRow key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No bookmarks yet." />
              )
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className={railCardClass} aria-label="Streak">
            {streak ? (
              <>
                <h2 className="mb-1 font-serif text-[15px] font-semibold text-[var(--pm-ink)]">
                  🔥 {streak.current > 0 ? `${streak.current}-day streak` : 'No streak yet'}
                </h2>
                <p className="mb-3 text-xs text-[var(--pm-muted)]">
                  Post or comment today to {streak.current > 0 ? 'keep it alive' : 'start one'}.
                  Best: {streak.best} days.
                </p>
                <StreakGrid days={streak.days} />
              </>
            ) : (
              <p className="text-xs text-[var(--pm-muted)]">
                No streak yet — post or comment today to start one
              </p>
            )}
          </section>

          {rows.length > 0 ? (
            <section
              className={railCardClass}
              aria-label="Points by circle"
              data-testid="circle-points-breakdown"
            >
              <h2 className={railHeadingClass}>Points by circle</h2>
              <ul className="flex flex-col gap-3">
                {rows.map((row) => (
                  <li key={row.slug} data-testid="circle-points-row">
                    <div className="flex items-baseline gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color ?? 'var(--pm-muted-soft)' }}
                      />
                      <Link
                        href={`/g/${row.slug}`}
                        className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                      >
                        {row.name}
                      </Link>
                      <span className="shrink-0 font-mono text-xs text-[var(--pm-muted)]">
                        {formatNumber(row.points)} pts
                      </span>
                    </div>
                    {row.share !== null ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div
                          aria-hidden="true"
                          className="h-1.5 flex-1 overflow-hidden rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-3)]"
                        >
                          <div
                            className="h-full rounded-[var(--pm-radius-pill)]"
                            style={{
                              width: `${Math.max(row.share, 2)}%`,
                              backgroundColor: row.color ?? 'var(--pm-teal)',
                            }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[11px] text-[var(--pm-muted)]">
                          {row.share}%
                        </span>
                      </div>
                    ) : null}
                    {row.acceptedSolutions > 0 ? (
                      <p className="mt-1 text-[11px] text-[var(--pm-muted)]">
                        {row.acceptedSolutions} accepted{' '}
                        {row.acceptedSolutions === 1 ? 'solution' : 'solutions'}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--pm-muted)]">
                {ledgerBacked
                  ? 'Share of points earned inside circles. Site-wide activity is not counted here.'
                  : 'All-time score per circle.'}
              </p>
            </section>
          ) : null}

          {badges.earned.length > 0 || badges.progress.length > 0 ? (
            <section className={railCardClass} aria-label="Achievements">
              <h2 className="mb-2.5 font-serif text-[15px] font-semibold text-[var(--pm-ink)]">
                Achievements
              </h2>
              {/* Reference renders achievements as pill chips: earned in ink,
                  in-progress muted with their live counter. */}
              <ul className="flex flex-wrap gap-[7px]">
                {badges.earned.map(({ badge }) => (
                  <li
                    key={badge.id}
                    className="inline-flex items-center rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper)] px-3 py-1 text-[11.5px] font-medium text-[var(--pm-ink-2)]"
                  >
                    {badge.name}
                  </li>
                ))}
                {badges.progress.map(({ badge, current, threshold }) => (
                  <li
                    key={badge.id}
                    className="inline-flex items-center rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper)] px-3 py-1 text-[11.5px] font-medium text-[var(--pm-muted)]"
                  >
                    {badge.name} · {current}/{threshold}
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
    <div className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
      <p className="text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}

/** Reference stat tile: mono number over a plain muted label, no icon. */
function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <div
      role="listitem"
      data-testid="profile-stat"
      className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper)] p-3"
    >
      <p className="font-mono text-[19px] font-semibold leading-tight text-[var(--pm-ink)]">
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-[var(--pm-muted)]">{label}</p>
    </div>
  );
}
