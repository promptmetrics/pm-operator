'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';

const ROLES = ['member', 'moderator', 'admin'] as const;

export default function AdminGroupMembersPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`);
      if (!res.ok) throw new Error('Failed to load members');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (userId: string, newRole: string) => {
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

  if (loading) {
    return <div className="mx-auto max-w-5xl"><p className="text-[var(--pm-muted)]">Loading members...</p></div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-[var(--pm-danger)]">{error}</p>
        <Button onClick={load} className="mt-4">Retry</Button>
      </div>
    );
  }

  if (!data) return null;

  const { group, stats, members } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/admin/groups/${id}`} className="text-sm text-[var(--pm-coral)] hover:underline">
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-semibold">Members</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        <Link href={`/admin/groups/${id}`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Overview</Link>
        <Link href={`/admin/groups/${id}/members`} className="border-b-2 border-[var(--pm-coral)] px-4 py-2 text-sm font-medium text-[var(--pm-coral)]">Members ({stats.members})</Link>
        <Link href={`/admin/groups/${id}/posts`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Posts ({stats.posts})</Link>
        <Link href={`/admin/groups/${id}/settings`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Settings</Link>
        <Link href={`/admin/groups/${id}/invites`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Invites</Link>
      </div>

      {!members || members.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No members found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((m: any) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.pictureUrl ? (
                    <img src={m.pictureUrl} alt="" className="h-10 w-10 rounded-full" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pm-muted)]/20 text-sm font-medium">
                      {m.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <Link href={`/admin/users/${m.userId}`} className="font-medium hover:text-[var(--pm-coral)]">
                      {m.username}
                    </Link>
                    <p className="text-sm text-[var(--pm-muted)]">
                      {m.reputationScore} reputation · joined {new Date(m.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value)}
                    className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
