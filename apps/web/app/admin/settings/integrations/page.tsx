'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { ArrowLeft, Puzzle, XCircle } from 'lucide-react';
import Link from 'next/link';
import DataTable from '@/components/admin/DataTable';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import type { Column, Action } from '@/components/admin/DataTable';

interface McpClient {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export default function AdminIntegrationsSettingsPage() {
  const [clients, setClients] = React.useState<McpClient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/integrations');
      if (!res.ok) throw new Error('Failed to load MCP clients');
      const json = (await res.json()) as { data?: { clients: McpClient[] } };
      setClients(json.data?.clients ?? []);
    } catch (err) {
      console.error('[admin/settings/integrations] load failed', err);
      setError('Could not load MCP clients. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const revokeClient = async (clientId: string) => {
    if (!confirm('Are you sure you want to revoke this MCP client? This action cannot be undone.')) return;

    setRevoking(clientId);
    try {
      const res = await fetch(`/api/v1/admin/integrations?clientId=${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to revoke MCP client');
      await load();
    } catch (err) {
      console.error('[admin/settings/integrations] revoke failed', err);
      setError('Could not revoke that MCP client. It may still have access — try again.');
    } finally {
      setRevoking(null);
    }
  };

  const columns: Column<McpClient>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--pm-ink)]">{row.name}</p>
          <p className="text-xs text-[var(--pm-muted)]">{row.clientId}</p>
        </div>
      ),
    },
    {
      key: 'scopes',
      label: 'Scopes',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.scopes.map((scope) => (
            <span
              key={scope}
              className="rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-2 py-0.5 text-xs text-[var(--pm-muted)]"
            >
              {scope}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (row) =>
        row.isActive ? (
          <span className="rounded-full border border-[var(--pm-green-line)] px-2 py-0.5 text-xs font-medium text-[var(--pm-green)]">
            Active
          </span>
        ) : (
          <span className="rounded-full border border-[var(--pm-danger)] px-2 py-0.5 text-xs font-medium text-[var(--pm-danger)]">
            Revoked
          </span>
        ),
    },
    {
      key: 'createdAt',
      label: 'Last active',
      render: (row) => (
        <span className="text-sm text-[var(--pm-muted)]">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const actions: Action<McpClient>[] = [
    {
      label: 'Revoke',
      icon: <XCircle size={14} />,
      danger: true,
      onClick: (row) => revokeClient(row.clientId),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/settings"
        className="mb-4 flex items-center gap-2 text-sm text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <Puzzle className="h-6 w-6 text-[var(--pm-coral)]" />
        <h1 className="text-2xl font-semibold">Integrations</h1>
      </div>

      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        Manage MCP client connections. Revoking a client immediately disables its access.
      </p>

      {error ? (
        <ErrorState
          message={error}
          onRetry={load}
          variant="error"
          className="mb-6"
        />
      ) : null}

      {loading ? (
        <LoadingState type="table" rows={4} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Puzzle className="h-8 w-8" />}
          title="No MCP clients"
          message="No MCP clients have been connected yet."
        />
      ) : (
        <DataTable<McpClient>
          columns={columns}
          data={clients}
          rowKey="id"
          actions={actions}
          emptyMessage="No MCP clients found."
        />
      )}
    </div>
  );
}
