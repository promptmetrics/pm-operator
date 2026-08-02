'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { AgentActionListItem } from '@pm-operator/api';

// T8.12 (ADMIN-5): admin-only, list-only audit of MCP agent actions. No
// create/update/delete — purely for triaging tool calls, errors, and latency.
// The admin layout already gates on role === 'admin'. Pagination is page-based
// (Prev/Next) using the route's hasMore; filters debounce like the users page.
export default function AdminAgentActionsPage() {
  const [actions, setActions] = React.useState<AgentActionListItem[]>([]);
  const [clientId, setClientId] = React.useState('');
  const [toolName, setToolName] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (clientId) params.set('clientId', clientId);
      if (toolName) params.set('toolName', toolName);
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
  }, [clientId, toolName, page]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Reset to page 1 when filters change.
  React.useEffect(() => {
    setPage(1);
  }, [clientId, toolName]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Agent actions</h1>
      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        Audit log of MCP tool calls logged by the operator. List only — no edits.
      </p>

      <Card className="mb-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </Card>

      {message ? <p className="mb-4 text-[var(--pm-danger)]">{message}</p> : null}

      {loading && actions.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading…</p>
      ) : actions.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No agent actions match.</p>
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

      <div className="mt-6 flex items-center justify-between">
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
      </div>
    </div>
  );
}