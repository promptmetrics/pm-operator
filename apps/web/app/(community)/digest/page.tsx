// Weekly digest page (T8.3, redesigned to the reference in track set A). A
// read-only summary of the trailing 7 days: stat trio, the hot-topic circle,
// the three sections (top posts / new builds / still unanswered), plus the
// pre-existing top-contributors and weekly-leaderboard extras below.
// Server component — bounded to ≤3 concurrent queries (getWeeklyDigest's waves
// peak at 3; listGlobalLeaderboard runs alongside its first wave).

import Link from 'next/link';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getWeeklyDigest } from '@/lib/services/digest';
import { listGlobalLeaderboard } from '@/lib/services/community';
import { timeAgo } from '@/lib/format';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { POINT_WEIGHTS } from '@pm-operator/api';
import type { DigestSectionItem } from '@pm-operator/api';

// "Aug 3 – Aug 10, 2026" for the trailing 7-day window.
function weekRangeLabel(): string {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3.5 text-center">
      <p className="font-mono text-[22px] font-semibold text-[var(--pm-ink)]">{value}</p>
      <p className="mt-1 text-[11.5px] text-[var(--pm-muted)]">{label}</p>
    </div>
  );
}

function DigestSection({
  title,
  items,
  stat,
  meta,
}: {
  title: string;
  items: DigestSectionItem[];
  stat: (item: DigestSectionItem) => string;
  meta: (item: DigestSectionItem) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2.5 font-serif text-[17px] font-semibold text-[var(--pm-ink)]">{title}</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/p/${item.id}`}
            className="flex items-center gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3 transition-colors hover:border-[var(--pm-line-2)]"
          >
            <span className="w-10 shrink-0 font-mono text-xs font-semibold text-[var(--pm-coral-dark)]">
              {stat(item)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-snug text-[var(--pm-ink)]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--pm-muted-soft)]">
                {meta(item)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function DigestPage() {
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const [digest, leaderboard] = await Promise.all([
    getWeeklyDigest(db, undefined, currentUserId).catch(() => null),
    listGlobalLeaderboard(db, 'weekly', 10),
  ]);

  const posts = digest?.posts ?? 0;
  const solutions = digest?.solutionsAccepted ?? 0;
  const newMembers = digest?.newMembers ?? 0;
  const hotTopicName = digest?.hotTopicName ?? '';
  const hotTopicUrl = digest?.hotTopicUrl ?? '';
  const topContributors = digest?.topContributors ?? '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pm-coral-dark)]">
          Weekly digest · {weekRangeLabel()}
        </p>
        <h1 className="font-serif text-[26px] font-semibold text-[var(--pm-ink)]">
          Your circles, this week
        </h1>
        <p className="mt-1 text-sm text-[var(--pm-muted)]">
          {currentUserId
            ? 'Built from your circles — the circles you follow.'
            : 'Built from every circle in the community — the last 7 days.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard value={String(posts)} label={posts === 1 ? 'Post' : 'Posts'} />
        <StatCard value={String(solutions)} label="Solutions accepted" />
        <StatCard value={String(newMembers)} label="New members" />
      </div>

      {hotTopicName ? (
        <section className="rounded-xl border border-[var(--pm-line)] border-l-[3px] border-l-[var(--pm-teal)] bg-[var(--pm-paper-inset)] p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-teal-dark)]">
            Hot topic
          </p>
          <p className="text-sm leading-relaxed text-[var(--pm-ink-2)]">
            <Link
              href={hotTopicUrl}
              className="font-semibold text-[var(--pm-teal-dark)] hover:underline"
            >
              {hotTopicName}
            </Link>{' '}
            led the community this week — the most posts, comments, and accepted
            solutions of any circle.
          </p>
        </section>
      ) : null}

      <DigestSection
        title="Top posts"
        items={digest?.topPosts ?? []}
        stat={(item) => `▲ ${item.upvotes}`}
        meta={(item) =>
          `${item.authorName} · ${item.circleName}${item.solved ? ' · ✓ Solved' : ''}`
        }
      />
      <DigestSection
        title="New builds"
        items={digest?.newBuilds ?? []}
        stat={(item) => `▲ ${item.upvotes}`}
        meta={(item) => `${item.authorName} · ${item.circleName}`}
      />
      <DigestSection
        title={`Still unanswered — earn +${POINT_WEIGHTS.solution_accepted}`}
        items={digest?.unansweredQuestions ?? []}
        stat={(item) => `💬 ${item.stat}`}
        meta={(item) => `${item.authorName} · ${item.circleName} · ${timeAgo(item.createdAt)}`}
      />

      {topContributors ? (
        <Card>
          <CardHeader>
            <CardTitle>Top contributors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--pm-ink-2)]">{topContributors}</p>
          </CardContent>
        </Card>
      ) : null}

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
