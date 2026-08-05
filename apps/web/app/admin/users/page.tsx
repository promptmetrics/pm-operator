'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { UserListItem, UserRole } from '@pm-operator/api';
import { Search, ArrowUpDown, CheckSquare, Square } from 'lucide-react';

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((u) => u.id)));
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = [...users].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'username') cmp = (a.fullName || a.username).localeCompare(b.fullName || b.username);
    else if (sortField === 'reputationScore') cmp = a.reputationScore - b.reputationScore;
    else if (sortField === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-sm font-medium text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

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

      {loading && users.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No users match.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Table header */}
          <div className="hidden grid-cols-12 gap-4 px-4 sm:grid">
            <div className="col-span-1">
              <button onClick={toggleSelectAll} className="text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">
                {selected.size === filtered.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="col-span-3"><SortHeader field="username" label="Name / Username" /></div>
            <div className="col-span-2 text-sm text-[var(--pm-muted)]">Email</div>
            <div className="col-span-1 text-sm text-[var(--pm-muted)]">Role</div>
            <div className="col-span-1"><SortHeader field="reputationScore" label="Rep" /></div>
            <div className="col-span-2"><SortHeader field="createdAt" label="Joined" /></div>
            <div className="col-span-2" />
          </div>

          {filtered.map((user) => (
            <Card key={user.id} className="p-4">
              <CardContent>
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-1">
                    <button
                      onClick={() => toggleSelect(user.id)}
                      className="text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
                    >
                      {selected.has(user.id) ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="col-span-12 flex items-center gap-3 sm:col-span-3">
                    {user.pictureUrl ? (
                      <img src={user.pictureUrl} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pm-muted)]/20 text-sm font-medium">
                        {(user.fullName || user.username)?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link href={`/admin/users/${user.id}`} className="truncate font-medium hover:text-[var(--pm-coral)]">
                        {user.fullName || user.username}
                      </Link>
                      <p className="truncate text-xs text-[var(--pm-muted)]">@{user.userslug}</p>
                    </div>
                  </div>
                  <div className="col-span-3 truncate text-sm text-[var(--pm-muted)] sm:col-span-2">
                    {user.email}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <select
                      value={user.role}
                      onChange={(e) => setUserRole(user.id, e.target.value as UserRole)}
                      className="h-8 rounded border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-2 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 text-sm sm:col-span-1">
                    {user.reputationScore}
                  </div>
                  <div className="col-span-3 text-sm text-[var(--pm-muted)] sm:col-span-2">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-2 text-right sm:col-span-2">
                    <Link href={`/admin/users/${user.id}`}>
                      <Button variant="secondary" size="sm">View</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
