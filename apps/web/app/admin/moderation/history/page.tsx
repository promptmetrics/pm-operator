'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { Select } from '@pm-operator/ui/components/Select';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Search, Filter, Clock, Shield, User, Circle } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetUserId: string | null;
  circleId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  flag_resolved: 'Flag resolved',
  flag_dismissed: 'Flag dismissed',
  post_approved: 'Post approved',
  post_declined: 'Post declined',
  user_warned: 'User warned',
  user_banned: 'User banned',
  content_hidden: 'Content hidden',
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  flag_resolved: Shield,
  flag_dismissed: Shield,
  post_approved: Shield,
  post_declined: Shield,
  user_warned: Shield,
  user_banned: Shield,
  content_hidden: Shield,
};

export default function HistoryPage() {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [filters, setFilters] = React.useState({
    actionType: '',
    dateFrom: '',
    dateTo: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filters.actionType) params.set('actionType', filters.actionType);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      const res = await fetch(`/api/v1/admin/moderation/history?${params}`);
      if (!res.ok) throw new Error('Failed to load moderation history');
      const json = await res.json();
      setLogs(json.data?.logs ?? []);
      setHasMore(json.meta?.hasMore ?? false);
    } catch (err: any) {
      setError(err.message || 'Failed to load moderation history');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  if (loading && logs.length === 0) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Moderation history</h1>

      {/* Filter bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[160px]">
              <Select
                label="Action type"
                value={filters.actionType}
                onChange={(e) => handleFilterChange('actionType', e.target.value)}
              >
                <option value="">All actions</option>
                <option value="flag_resolved">Flag resolved</option>
                <option value="flag_dismissed">Flag dismissed</option>
                <option value="post_approved">Post approved</option>
                <option value="post_declined">Post declined</option>
                <option value="user_warned">User warned</option>
                <option value="user_banned">User banned</option>
                <option value="content_hidden">Content hidden</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Input
                label="From date"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Input
                label="To date"
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={load}>
              <Filter className="mr-1 h-4 w-4" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      {logs.length === 0 ? (
        <EmptyState title="Moderation History" message="No moderation history found" />
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => {
            const Icon = ACTION_ICONS[log.action] ?? Shield;
            const label = ACTION_LABELS[log.action] ?? log.action;

            return (
              <Card key={log.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--pm-paper-2)]">
                    <Icon className="h-4 w-4 text-[var(--pm-muted)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-[var(--pm-muted)]">
                      by {log.actorName ?? 'Unknown'}
                      {log.targetType && <> on {log.targetType}</>}
                      {log.circleId && <> in circle</>}
                    </p>
                    {Boolean((log.details as any)?.feedback) && (
                      <p className="mt-1 text-xs text-[var(--pm-muted)]">
                        Feedback: {String((log.details as any).feedback)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--pm-muted)] shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          <div className="flex justify-center gap-2 pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center px-3 text-sm text-[var(--pm-muted)]">
              Page {page}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
