'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { UserListItem, UserRole } from '@pm-operator/api';

const ROLES: UserRole[] = ['member', 'moderator', 'admin'];

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserListItem[]>([]);
  const [query, setQuery] = React.useState('');
  const [role, setRole] = React.useState<UserRole | ''>('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
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
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to update role', variant: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Users</h1>

      <Card className="mb-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username, slug, or email"
          />
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

      {message ? <p className="mb-4 text-[var(--pm-danger)]">{message}</p> : null}

      {loading && users.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No users match.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <Card key={user.id} className="p-4">
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {user.fullName || user.username} ·{' '}
                    <Link href={`/u/${user.userslug}`} className="text-[var(--pm-coral)] hover:underline">
                      @{user.userslug}
                    </Link>
                  </p>
                  <p className="text-sm text-[var(--pm-muted)]">
                    {user.email} · {user.reputationScore} reputation · joined {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={user.role}
                    onChange={(e) => setUserRole(user.id, e.target.value as UserRole)}
                    className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <Link href={`/u/${user.userslug}`}>
                    <Button variant="secondary" size="sm">View</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
