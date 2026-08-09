'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Trophy, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import DataTable from '@/components/admin/DataTable';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import type { LeaderboardPeriod } from '@pm-operator/api';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all_time', label: 'All time' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
];

interface LeaderboardEntry {
  rank: number;
  userslug: string;
  username: string;
  score: number;
  role: string;
  streakDays: number;
}

export default function AdminLeaderboardsPage() {
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('all_time');
  const [entries, setEntries] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async (p: LeaderboardPeriod, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p, page: String(pg), limit: '50' });
      const res = await fetch(`/api/v1/admin/leaderboards?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load leaderboard');
      const json = (await res.json()) as {
        data?: { leaderboard: LeaderboardEntry[]; period: string };
        meta?: { hasMore: boolean };
      };
      setEntries(json.data?.leaderboard ?? []);
      setHasMore(json.meta?.hasMore ?? false);
    } catch (err) {
      console.error('[admin/leaderboards] load failed', err);
      setError('Could not load the leaderboard. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setPage(1);
    load(period, 1);
  }, [period, load]);

  const handleReset = async () => {
    setResetting(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/admin/leaderboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      if (!res.ok) throw new Error('Failed to reset leaderboard');
      setMessage(`Leaderboard for "${period}" has been reset.`);
      setShowResetConfirm(false);
      await load(period, 1);
    } catch (err: any) {
      setMessage(err.message || 'Failed to reset leaderboard');
    } finally {
      setResetting(false);
    }
  };

  const handleExportCsv = () => {
    const header = 'rank,username,userslug,score,role,streakDays\n';
    const rows = entries
      .map((e) => `${e.rank},${e.username},${e.userslug},${e.score},${e.role},${e.streakDays}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaderboard-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { key: 'rank', label: 'Rank', sortable: true, render: (row: Record<string, unknown>) => <span className="font-medium">{(row as unknown as LeaderboardEntry).rank}</span> },
    { key: 'username', label: 'Username', sortable: true, render: (row: Record<string, unknown>) => {
      const e = row as unknown as LeaderboardEntry;
      return <span className="font-medium text-[var(--pm-ink)]">{e.username}</span>;
    }},
    { key: 'userslug', label: 'Slug', sortable: true, render: (row: Record<string, unknown>) => {
      const e = row as unknown as LeaderboardEntry;
      return <span className="text-sm text-[var(--pm-muted)]">{e.userslug}</span>;
    }},
    { key: 'score', label: 'Score', sortable: true, render: (row: Record<string, unknown>) => {
      const e = row as unknown as LeaderboardEntry;
      return <span className="font-semibold">{e.score.toLocaleString()}</span>;
    }},
    { key: 'streakDays', label: 'Streak', sortable: true, render: (row: Record<string, unknown>) => {
      const e = row as unknown as LeaderboardEntry;
      return <span>{e.streakDays}d</span>;
    }},
    { key: 'role', label: 'Role', sortable: true, render: (row: Record<string, unknown>) => {
      const e = row as unknown as LeaderboardEntry;
      return <span className="text-sm text-[var(--pm-muted)]">{e.role}</span>;
    }},
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leaderboards</h1>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleExportCsv} disabled={entries.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => setShowResetConfirm(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* Period selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                : 'bg-[var(--pm-paper-inset)] text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className={`mb-4 text-sm ${message.includes('reset') ? 'text-green-600' : 'text-[var(--pm-danger)]'}`}>
          {message}
        </p>
      ) : null}

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="mb-6 rounded-lg border border-[var(--pm-danger)] bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pm-danger)]" />
            <div className="flex-1">
              <p className="font-medium text-[var(--pm-danger)]">Reset leaderboard?</p>
              <p className="mt-1 text-sm text-[var(--pm-muted)]">
                This will set all scores to 0 for the &ldquo;{period}&rdquo; period. This action cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <Button onClick={handleReset} disabled={resetting}>
                  {resetting ? 'Resetting...' : 'Confirm reset'}
                </Button>
                <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      {loading && entries.length === 0 ? (
        <LoadingState rows={5} type="table" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(period, page)} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title="No entries yet"
          message={`No scores recorded for the "${period}" period.`}
        />
      ) : (
        <DataTable
          columns={columns}
          data={entries as unknown as Record<string, unknown>[]}
          rowKey="rank"
          page={page}
          hasMore={hasMore}
          onPageChange={(p) => {
            setPage(p);
            load(period, p);
          }}
        />
      )}
    </div>
  );
}
