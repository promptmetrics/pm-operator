'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { AgentActionListItem } from '@pm-operator/api';
import { Download, TrendingUp, TrendingDown, Minus, Terminal } from 'lucide-react';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';

// T8.12 (ADMIN-5): admin-only, list-only audit of MCP agent actions. No
// create/update/delete — purely for triaging tool calls, errors, and latency.
// The admin layout already gates on role === 'admin'. Pagination is page-based
// (Prev/Next) using the route's hasMore; filters debounce like the users page.
export default function AdminAgentActionsPage() {
  const [actions, setActions] = React.useState<AgentActionListItem[]>([]);
  const [clientId, setClientId] = React.useState('');
  const [toolName, setToolName] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [errorRate, setErrorRate] = React.useState<{ errorRate: number; total: number; errored: number } | null>(null);

  const buildParams = React.useCallback(
    (p: number) => {
      const params = new URLSearchParams({ page: String(p) });
      if (clientId) params.set('clientId', clientId);
      if (toolName) params.set('toolName', toolName);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return params;
    },
    [clientId, toolName, startDate, endDate]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = buildParams(page);
      const res = await fetch(`/api/v1/admin/agent-actions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load agent actions');
      const json = (await res.json()) as {
        data?: { actions: AgentActionListItem[] };
        meta?: { hasMore?: boolean };
      };
      setActions(json.data?.actions ?? []);
      setHasMore(Boolean(json.meta?.hasMore));
    } catch (err: any) {
      setMessage(err.message || 'Failed to load agent actions');
    } finally {
      setLoading(false);
    }
  }, [buildParams, page]);

  const loadErrorRate = React.useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/agent-actions?includeErrorRate=true&page=1&limit=1');
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: { errorRate: { errorRate: number; total: number; errored: number } };
      };
      if (json.data?.errorRate) setErrorRate(json.data.errorRate);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    loadErrorRate();
  }, [loadErrorRate]);

  // Reset to page 1 when filters change.
  React.useEffect(() => {
    setPage(1);
  }, [clientId, toolName, startDate, endDate]);

  const exportCsv = () => {
    const headers = ['ID', 'Client ID', 'User', 'Tool Name', 'Error', 'Duration (ms)', 'Input Preview', 'Output Preview', 'Created At'];
    const rows = actions.map((a) => [
      a.id,
      a.clientId,
      a.username ?? a.userId ?? '',
      a.toolName,
      a.error ?? '',
      a.durationMs !== null ? String(a.durationMs) : '',
      a.inputPreview.replace(/"/g, '""'),
      a.outputPreview.replace(/"/g, '""'),
      a.createdAt,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-actions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TrendIcon = errorRate && errorRate.errorRate > 0
    ? TrendingUp
    : errorRate && errorRate.errorRate === 0
      ? TrendingDown
      : Minus;

  const trendColor = errorRate && errorRate.errorRate > 10
    ? 'var(--pm-danger)'
    : errorRate && errorRate.errorRate > 0
      ? 'var(--pm-coral)'
      : 'var(--pm-green)';

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Agent actions</h1>
      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        Audit log of MCP tool calls logged by the operator. List only — no edits.
      </p>

      {/* Error rate summary */}
      {errorRate !== null && (
        <Card className="mb-6 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <TrendIcon className="h-5 w-5" style={{ color: trendColor }} />
              <span className="text-lg font-semibold" style={{ color: trendColor }}>
                {errorRate.errorRate}%
              </span>
              <span className="text-sm text-[var(--pm-muted)]">
                of tool calls errored in last 24h
              </span>
            </div>
            <span className="text-xs text-[var(--pm-muted)]">
              ({errorRate.errored} / {errorRate.total} calls)
            </span>
          </div>
        </Card>
      )}

      <Card className="mb-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Filter by MCP client id"
          />
          <Input
            label="Tool name"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="Filter by tool name"
          />
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={exportCsv} disabled={actions.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </Card>

      {message ? <p className="mb-4 text-[var(--pm-danger)]">{message}</p> : null}

      {loading && actions.length === 0 ? (
        <LoadingState rows={5} type="card" />
      ) : actions.length === 0 ? (
        <EmptyState
          icon={<Terminal className="h-10 w-10" />}
          title="No agent actions"
          message="No agent actions match the current filters."
          className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-16"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {actions.map((action) => (
            <Card key={action.id} className="p-4">
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-[var(--pm-ink)]">
                      {action.toolName}
                    </p>
                    <p className="truncate text-xs text-[var(--pm-muted)]">
                      client {action.clientId}
                      {action.username ? ` · @${action.username}` : action.userId ? ` · ${action.userId}` : ''}
                      {action.durationMs !== null ? ` · ${action.durationMs}ms` : ''}
                      {' · '}
                      {new Date(action.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {action.error ? (
                    <span className="shrink-0 rounded-full border border-[var(--pm-danger)] bg-[var(--pm-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pm-danger)]">
                      errored
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-[var(--pm-green-line)] px-2 py-0.5 text-xs font-medium text-[var(--pm-green)]">
                      ok
                    </span>
                  )}
                </div>

                {action.error ? (
                  <p className="rounded-lg border border-[var(--pm-danger)] bg-[var(--pm-danger-bg)] p-3 font-mono text-xs text-[var(--pm-danger)]">
                    {action.error}
                  </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <details className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--pm-ink)]">
                      Input
                    </summary>
                    <pre className="mt-2 overflow-x-auto font-mono text-xs text-[var(--pm-muted)]">
                      {action.inputPreview || '(empty)'}
                    </pre>
                  </details>
                  <details className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--pm-ink)]">
                      Output
                    </summary>
                    <pre className="mt-2 overflow-x-auto font-mono text-xs text-[var(--pm-muted)]">
                      {action.outputPreview || '(empty)'}
                    </pre>
                  </details>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
        <Button
          variant="secondary"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <span className="text-sm text-[var(--pm-muted)]">Page {page}</span>
        <Button variant="secondary" disabled={!hasMore || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </nav>
    </div>
  );
}
