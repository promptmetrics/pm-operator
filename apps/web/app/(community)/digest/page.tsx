// Weekly digest page (T8.3). A read-only summary of the trailing 7 days:
// totals, the hot-topic circle, top contributors, and the weekly leaderboard.
// Server component — bounded to ≤3 concurrent queries (getWeeklyDigest's wave 1
// is 2 queries; listGlobalLeaderboard runs alongside it, then digest's later
// waves run alone).

import Link from 'next/link';
import { createServiceDb } from '@/lib/db';
import { getWeeklyDigest } from '@/lib/services/digest';
import { listGlobalLeaderboard } from '@/lib/services/community';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-serif text-[28px] font-semibold text-[var(--pm-ink)]">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
        {label}
      </div>
    </div>
  );
}

export default async function DigestPage() {
  const db = createServiceDb();

  const [digest, leaderboard] = await Promise.all([
    getWeeklyDigest(db).catch(() => null),
    listGlobalLeaderboard(db, 'weekly', 10),
  ]);

  const posts = digest?.posts ?? 0;
  const solutions = digest?.solutionsAccepted ?? 0;
  const hotTopicName = digest?.hotTopicName ?? '';
  const hotTopicUrl = digest?.hotTopicUrl ?? '';
  const topContributors = digest?.topContributors ?? '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">
          Weekly digest
        </h1>
        <p className="text-sm text-[var(--pm-muted)]">
          The last 7 days across the community
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This week in numbers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Stat value={String(posts)} label={posts === 1 ? 'Post' : 'Posts'} />
            <Stat value={String(solutions)} label="Solutions" />
            <Stat value={hotTopicName ? '1' : '0'} label="Hot topic" />
          </div>

          {hotTopicName ? (
            <div className="mt-6 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
                Hot topic
              </p>
              <Link
                href={hotTopicUrl}
                className="mt-1 block font-serif text-lg font-semibold text-[var(--pm-coral)] hover:underline"
              >
                {hotTopicName}
              </Link>
              <p className="mt-1 text-sm text-[var(--pm-muted)]">
                The circle with the most posts, comments, and accepted solutions this week.
              </p>
            </div>
          ) : null}

          {topContributors ? (
            <div className="mt-6">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
                Top contributors
              </p>
              <p className="text-sm text-[var(--pm-ink-2)]">{topContributors}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-[var(--pm-line)]">
            {leaderboard.map((entry) => (
              <li key={entry.userslug} className="flex items-center gap-3 py-3">
                <span className="w-6 text-sm font-semibold text-[var(--pm-muted)]">
                  {entry.rank}
                </span>
                <Link href={`/u/${entry.userslug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar
                    alt={entry.username}
                    fallback={entry.username}
                    size="sm"
                    badge={<LevelBadge level={entry.level} size="xs" />}
                  />
                  <span className="truncate text-sm font-medium text-[var(--pm-ink)]">
                    {entry.username}
                  </span>
                </Link>
                <span className="text-sm font-semibold text-[var(--pm-ink-2)]">
                  {entry.score.toLocaleString()} pts
                </span>
                <span className="hidden text-xs text-[var(--pm-muted)] sm:inline">
                  {entry.acceptedSolutions} solutions
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}