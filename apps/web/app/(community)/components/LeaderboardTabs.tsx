'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Chip } from '@pm-operator/ui/components/Chip';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { PodiumCard } from '@pm-operator/ui/components/PodiumCard';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { LeaderboardEntry } from '@pm-operator/api';

type BoardKey = 'weekly' | 'monthly' | 'all_time' | 'solutions' | 'streaks';

interface BoardDef {
  key: BoardKey;
  label: string;
  query: string;
  /** Windowed points boards (week/month) show "+N"; all-time shows plain N. */
  windowed: boolean;
}

const BOARDS: BoardDef[] = [
  { key: 'weekly', label: 'This week', query: 'type=points&period=weekly', windowed: true },
  { key: 'monthly', label: 'This month', query: 'type=points&period=monthly', windowed: true },
  { key: 'all_time', label: 'All time', query: 'type=points&period=all_time', windowed: false },
  { key: 'solutions', label: 'Most solutions', query: 'type=solutions&period=all_time', windowed: false },
  { key: 'streaks', label: 'Longest streaks', query: 'type=streaks&period=all_time', windowed: false },
];

interface BoardData {
  entries: LeaderboardEntry[];
  viewer: LeaderboardEntry | null;
}

interface LeaderboardTabsProps {
  initialEntries: LeaderboardEntry[];
  initialViewer: LeaderboardEntry | null;
}

function formatPoints(score: number, windowed: boolean): string {
  return windowed ? `+${score}` : `${score}`;
}

function isModerator(role: string): boolean {
  return role === 'moderator' || role === 'admin';
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
  // The design's podium order: rank 2, rank 1 elevated in the center, rank 3.
  const podium = [entries[1], entries[0], entries[2]];

  const renderRow = (entry: LeaderboardEntry) => {
    const isViewerRow = viewer !== null && entry.userslug === viewer.userslug;
    return (
      <tr
        key={entry.userslug}
        className={
          isViewerRow
            ? 'bg-[var(--pm-coral-tint)]'
            : 'hover:bg-[var(--pm-paper-2)]/50'
        }
      >
        <td className="px-4 py-3 font-semibold">{entry.rank}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${entry.userslug}`}
              className="flex min-w-0 items-center gap-2 hover:text-[var(--pm-coral-dark)]"
            >
              <Avatar src={undefined} alt={entry.username} fallback={entry.username} size="sm" />
              <span className="truncate font-medium">{entry.username}</span>
            </Link>
            {isModerator(entry.role) ? (
              <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                Mod
              </Badge>
            ) : null}
            {isViewerRow ? (
              <span className="text-xs font-semibold text-[var(--pm-coral-dark)]">You</span>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3 text-[var(--pm-muted)]">Lv {entry.level}</td>
        <td className="px-4 py-3 text-right">{entry.acceptedSolutions}</td>
        <td className="px-4 py-3 text-right">{entry.streakDays} days</td>
        <td className="px-4 py-3 text-right font-semibold">
          {formatPoints(entry.score, def.windowed)}
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">Leaderboards</h1>
        <p className="text-sm text-[var(--pm-muted)]">
          Points from posts, comments, accepted solutions, and streak bonuses
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {BOARDS.map((b) => (
          <Chip key={b.key} active={board === b.key} onClick={() => selectBoard(b)}>
            {b.label}
          </Chip>
        ))}
      </div>

      {entries.length > 0 ? (
        <div className="mb-6 grid grid-cols-3 items-end gap-3">
          {podium.map((entry, i) => {
            const center = i === 1;
            if (!entry) return <div key={`empty-${i}`} aria-hidden="true" />;
            return (
              <PodiumCard
                key={entry.userslug}
                rank={entry.rank}
                name={entry.username}
                subtitle={
                  center
                    ? `${entry.acceptedSolutions} solutions · ${entry.streakDays}-day streak`
                    : `${entry.acceptedSolutions} solutions`
                }
                score={formatPoints(entry.score, def.windowed)}
                highlight={center}
                badge={center && board === 'weekly' ? 'Operator of the week' : undefined}
                avatar={
                  <Avatar
                    src={undefined}
                    alt={entry.username}
                    fallback={entry.username}
                    size={center ? 'lg' : 'md'}
                    className={center ? 'ring-2 ring-[var(--pm-coral)]' : undefined}
                    badge={<LevelBadge level={entry.level} size={center ? 'md' : 'sm'} />}
                  />
                }
              />
            );
          })}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--pm-paper-2)]">
            <tr>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 text-right font-medium">Solutions</th>
              <th className="px-4 py-3 text-right font-medium">Streak</th>
              <th className="px-4 py-3 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pm-line)]">
            {entries.map(renderRow)}
            {viewer && !viewerListed ? renderRow(viewer) : null}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--pm-muted)]">
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
