'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { UserListItem, UserRole } from '@pm-operator/api';
import { Search, Users } from 'lucide-react';
import DataTable, { type Column } from '@/components/admin/DataTable';

const ROLES: UserRole[] = ['member', 'moderator', 'admin'];

type SortField = 'username' | 'reputationScore' | 'createdAt';
type SortDir = 'asc' | 'desc';

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserListItem[]>([]);
  const [query, setQuery] = React.useState('');
  const [role, setRole] = React.useState<UserRole | ''>('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [sortField, setSortField] = React.useState<SortField>('createdAt');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (role) params.set('role', role);
      const res = await fetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load users');
      const json = (await res.json()) as { data?: { users: UserListItem[] } };
      setUsers(json.data?.users ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [query, role]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const setUserRole = async (userId: string, newRole: UserRole) => {
    try {
      const res = await fetch(`/api/v1/admin/users?id=${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      toast({ title: 'Role updated', variant: 'success' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to update role', variant: 'error' });
    }
  };

  const bulkChangeRole = async (newRole: UserRole) => {
    if (selected.size === 0) {
      toast({ title: 'No users selected', variant: 'error' });
      return;
    }
    let success = 0;
    let fail = 0;
    for (const userId of selected) {
      try {
        await fetch(`/api/v1/admin/users?id=${userId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });
        success++;
      } catch {
        fail++;
      }
    }
    toast({
      title: `Updated ${success} users${fail > 0 ? `, ${fail} failed` : ''}`,
      variant: fail > 0 ? 'error' : 'success',
    });
    setSelected(new Set());
    await load();
  };

  // DataTable computes the next direction with the same rule the old header
  // buttons used: flip when the key is unchanged, otherwise start ascending.
  const handleSort = (key: string, dir: SortDir) => {
    setSortField(key as SortField);
    setSortDir(dir);
  };

  const filtered = [...users].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'username') cmp = (a.fullName || a.username).localeCompare(b.fullName || b.username);
    else if (sortField === 'reputationScore') cmp = a.reputationScore - b.reputationScore;
    else if (sortField === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const columns: Column<UserListItem>[] = [
    {
      key: 'username',
      label: 'Name / Username',
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-3">
          {user.pictureUrl ? (
            <img src={user.pictureUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pm-paper-3)] text-sm font-medium text-[var(--pm-ink-2)]">
              {(user.fullName || user.username)?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <Link
              href={`/admin/users/${user.id}`}
              className="block truncate font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral)]"
            >
              {user.fullName || user.username}
            </Link>
            <p className="truncate text-xs text-[var(--pm-muted)]">@{user.userslug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (user) => <span className="text-[var(--pm-muted)]">{user.email}</span>,
    },
    {
      key: 'role',
      label: 'Role',
      render: (user) => (
        <select
          value={user.role}
          aria-label={`Role for ${user.fullName || user.username}`}
          onChange={(e) => setUserRole(user.id, e.target.value as UserRole)}
          className="h-8 rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-2 text-xs"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'reputationScore',
      label: 'Rep',
      sortable: true,
      align: 'right',
      render: (user) => (
        <span className="tabular-nums font-medium">{user.reputationScore}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Joined',
      sortable: true,
      render: (user) => (
        <span className="whitespace-nowrap text-[var(--pm-muted)]">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (user) => (
        <Link href={`/admin/users/${user.id}`}>
          <Button variant="secondary" size="sm">View</Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Users</h1>

      <Card className="mb-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pm-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username, or email..."
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] pl-10 pr-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">Role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole | '')}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card className="mb-6 border-[var(--pm-coral)] p-4">
          <div className="flex items-center gap-4">
            <p className="text-sm font-medium">{selected.size} selected</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--pm-muted)]">Change role to:</span>
              {ROLES.map((r) => (
                <Button key={r} variant="secondary" size="sm" onClick={() => bulkChangeRole(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      {message ? <p className="mb-4 text-[var(--pm-danger)]">{message}</p> : null}

      <DataTable<UserListItem>
        caption="Users"
        columns={columns}
        data={filtered}
        rowKey="id"
        sortKey={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        selectedIds={selected}
        onSelectionChange={(ids) => setSelected(new Set(ids as Set<string>))}
        loading={loading && users.length === 0}
        emptyIcon={<Users className="h-10 w-10" />}
        emptyMessage="No users match."
      />
    </div>
  );
}
