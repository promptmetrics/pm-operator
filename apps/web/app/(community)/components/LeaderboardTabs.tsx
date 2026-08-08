'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Chip } from '@pm-operator/ui/components/Chip';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { PodiumCard } from '@pm-operator/ui/components/PodiumCard';
import { useToast } from '@pm-operator/ui/components/Toast';
import { OPERATOR_LEVELS, type LeaderboardEntry } from '@pm-operator/api';

type BoardKey = 'weekly' | 'all_time' | 'solutions' | 'streaks';

interface BoardDef {
  key: BoardKey;
  label: string;
  query: string;
  /**
   * The column the board is actually ranked by. `score` is always the points
   * total (see leaderboardOrderSql), so the solutions/streaks boards must show
   * their own metric or the rank order looks arbitrary.
   */
  metric: (entry: LeaderboardEntry) => number;
  unit: { one: string; many: string };
}

const PTS = { one: 'pt', many: 'pts' };

const BOARDS: BoardDef[] = [
  {
    key: 'weekly',
    label: 'Points · this week',
    query: 'type=points&period=weekly',
    metric: (e) => e.score,
    unit: PTS,
  },
  {
    key: 'all_time',
    label: 'Points · all time',
    query: 'type=points&period=all_time',
    metric: (e) => e.score,
    unit: PTS,
  },
  {
    key: 'solutions',
    label: 'Most solutions',
    query: 'type=solutions&period=all_time',
    metric: (e) => e.acceptedSolutions,
    unit: { one: 'solution', many: 'solutions' },
  },
  {
    key: 'streaks',
    label: 'Longest streaks',
    query: 'type=streaks&period=all_time',
    metric: (e) => e.streakDays,
    unit: { one: 'day', many: 'days' },
  },
];

interface BoardData {
  entries: LeaderboardEntry[];
  viewer: LeaderboardEntry | null;
}

interface LeaderboardTabsProps {
  initialEntries: LeaderboardEntry[];
  initialViewer: LeaderboardEntry | null;
}

// Fixed locale: this renders on the server first, so an env-dependent number
// format would produce a hydration mismatch.
function formatScore(entry: LeaderboardEntry, def: BoardDef): string {
  const value = def.metric(entry);
  const unit = Math.abs(value) === 1 ? def.unit.one : def.unit.many;
  return `${value.toLocaleString('en-US')} ${unit}`;
}

function levelLabel(level: number): string {
  const name = OPERATOR_LEVELS.find((l) => l.level === level)?.name;
  return name ? `Lv ${level} · ${name}` : `Lv ${level}`;
}

export function LeaderboardTabs({ initialEntries, initialViewer }: LeaderboardTabsProps) {
  const { toast } = useToast();
  const [board, setBoard] = React.useState<BoardKey>('weekly');
  const [cache, setCache] = React.useState<Partial<Record<BoardKey, BoardData>>>({
    weekly: { entries: initialEntries, viewer: initialViewer },
  });
  const [loading, setLoading] = React.useState(false);

  const selectBoard = async (def: BoardDef) => {
    setBoard(def.key);
    if (cache[def.key]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leaderboards?${def.query}&limit=50`);
      if (!res.ok) throw new Error('Failed to load leaderboard');
      const json = (await res.json()) as {
        data?: { leaderboard?: LeaderboardEntry[]; viewer?: LeaderboardEntry | null };
      };
      setCache((prev) => ({
        ...prev,
        [def.key]: {
          entries: json.data?.leaderboard ?? [],
          viewer: json.data?.viewer ?? null,
        },
      }));
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to load leaderboard',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const def = BOARDS.find((b) => b.key === board)!;
  const data = cache[board];
  const entries = data?.entries ?? [];
  const viewer = data?.viewer ?? null;
  const viewerListed = viewer ? entries.some((e) => e.userslug === viewer.userslug) : false;
  // Visual podium order is 2nd · 1st · 3rd. Slots stay in place when the board
  // has fewer than three entries so 1st place is always the centre tile.
  const podium: (LeaderboardEntry | undefined)[] = [entries[1], entries[0], entries[2]];

  const renderRow = (entry: LeaderboardEntry, pinned: boolean) => {
    const isViewerRow = viewer !== null && entry.userslug === viewer.userslug;
    return (
      <tr
        key={entry.userslug}
        data-testid={pinned ? 'leaderboard-viewer-row' : 'leaderboard-row'}
        data-rank={entry.rank}
        data-userslug={entry.userslug}
        className={
          isViewerRow ? 'bg-[var(--pm-coral-tint)]' : 'hover:bg-[var(--pm-paper-2)]/50'
        }
      >
        <td className="w-14 px-4 py-3 text-right font-mono text-xs font-semibold text-[var(--pm-muted)]">
          {entry.rank}
        </td>
        <td className="px-4 py-3">
          <Link
            href={`/u/${entry.userslug}`}
            className="flex min-w-0 items-center gap-3 hover:text-[var(--pm-coral-dark)]"
          >
            <Avatar
              src={undefined}
              alt={entry.username}
              fallback={entry.username}
              size="sm"
              badge={<LevelBadge level={entry.level} size="xs" />}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-[var(--pm-ink)]">
                  {entry.username}
                </span>
                {isViewerRow ? (
                  <span
                    data-testid="you-chip"
                    className="shrink-0 rounded-[5px] bg-[var(--pm-coral-tint)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none text-[var(--pm-coral-dark)]"
                  >
                    You
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--pm-muted)]">
                {levelLabel(entry.level)}
              </span>
            </span>
          </Link>
        </td>
        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-[var(--pm-coral-dark)]">
          {formatScore(entry, def)}
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-3xl" aria-busy={loading}>
      <div className="mb-4">
        <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">Leaderboards</h1>
        <p className="text-sm text-[var(--pm-muted)]">
          Points from posts, comments, accepted solutions, and streak bonuses
        </p>
      </div>

      <div data-testid="leaderboard-boards" className="mb-5 flex flex-wrap gap-2">
        {BOARDS.map((b) => (
          <Chip key={b.key} active={board === b.key} onClick={() => selectBoard(b)}>
            {b.label}
          </Chip>
        ))}
      </div>

      {entries.length > 0 ? (
        <ol
          data-testid="podium"
          aria-label="Top operators"
          className="mb-5 grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2 sm:gap-3"
        >
          {podium.map((entry, slot) => {
            const first = slot === 1;
            if (!entry) return <li key={`podium-empty-${slot}`} aria-hidden="true" />;
            const crown = first && board === 'weekly';
            const score = formatScore(entry, def);
            return (
              <li key={entry.userslug}>
                <Link
                  href={`/u/${entry.userslug}`}
                  data-testid="podium-tile"
                  data-rank={entry.rank}
                  data-slot={first ? 'first' : 'side'}
                  aria-label={`Rank ${entry.rank}: ${entry.username}, ${score}${
                    crown ? ', operator of the week' : ''
                  }`}
                  className="block rounded-[var(--pm-radius-lg)] focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
                >
                  <PodiumCard
                    rank={entry.rank}
                    name={entry.username}
                    subtitle={levelLabel(entry.level)}
                    score={score}
                    highlight={first}
                    badge={crown ? '⭐ Operator of the week' : undefined}
                    avatar={
                      <Avatar
                        src={undefined}
                        alt={entry.username}
                        fallback={entry.username}
                        size={first ? 'lg' : 'md'}
                        className={first ? 'ring-2 ring-[var(--pm-coral)]' : undefined}
                        badge={<LevelBadge level={entry.level} size={first ? 'md' : 'sm'} />}
                      />
                    }
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}

      <Card className="overflow-hidden">
        <table data-testid="leaderboard-table" className="w-full text-left text-sm">
          <thead className="bg-[var(--pm-paper-2)] text-xs uppercase tracking-wide text-[var(--pm-muted)]">
            <tr>
              <th scope="col" className="w-14 px-4 py-2.5 text-right font-medium">
                Rank
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Member
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pm-line)]">
            {entries.map((entry) => renderRow(entry, false))}
            {viewer && !viewerListed ? (
              <>
                <tr aria-hidden="true">
                  <td
                    colSpan={3}
                    className="px-4 py-1 text-center font-mono text-xs text-[var(--pm-muted-soft)]"
                  >
                    ···
                  </td>
                </tr>
                {renderRow(viewer, true)}
              </>
            ) : null}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--pm-muted)]">
                  {loading ? 'Loading…' : 'No scores yet.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
