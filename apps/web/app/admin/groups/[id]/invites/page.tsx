'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';

const ROLES = ['member', 'moderator', 'admin'] as const;

export default function AdminGroupInvitesPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [data, setData] = React.useState<any>(null);
  const [invites, setInvites] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    maxUses: 1,
    expiresAt: '',
    role: 'member' as string,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [groupRes, invitesRes] = await Promise.all([
        fetch(`/api/v1/admin/groups/${id}`),
        fetch(`/api/v1/admin/invites?circleId=${id}`),
      ]);
      if (!groupRes.ok) throw new Error('Failed to load circle');
      const groupJson = await groupRes.json();
      setData(groupJson.data);

      if (invitesRes.ok) {
        const invitesJson = await invitesRes.json();
        setInvites(invitesJson.data?.invites ?? []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId: id,
          maxUses: form.maxUses,
          expiresAt: form.expiresAt || undefined,
          role: form.role,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invite');
      toast({ title: 'Invite created', variant: 'success' });
      setForm({ maxUses: 1, expiresAt: '', role: 'member' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to create invite', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/invites?id=${inviteId}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to revoke invite');
      toast({ title: 'Invite revoked', variant: 'success' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to revoke invite', variant: 'error' });
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl"><p className="text-[var(--pm-muted)]">Loading invites...</p></div>;
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

  const { group, stats } = data;

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/admin/groups/${id}`} className="text-sm text-[var(--pm-coral)] hover:underline">
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-semibold">Invites</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        <Link href={`/admin/groups/${id}`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Overview</Link>
        <Link href={`/admin/groups/${id}/members`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Members ({stats.members})</Link>
        <Link href={`/admin/groups/${id}/posts`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Posts ({stats.posts})</Link>
        <Link href={`/admin/groups/${id}/settings`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Settings</Link>
        <Link href={`/admin/groups/${id}/invites`} className="border-b-2 border-[var(--pm-coral)] px-4 py-2 text-sm font-medium text-[var(--pm-coral)]">Invites</Link>
      </div>

      {/* Create invite form */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Create invite code</h2>
        <form onSubmit={createInvite} className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Max uses"
            type="number"
            min={1}
            value={form.maxUses}
            onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
          />
          <Input
            label="Expires at"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          />
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">Role</label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end sm:col-span-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create invite'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Invite list */}
      {invites.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No invite codes for this circle.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {invites.map((invite: any) => (
            <Card key={invite.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{invite.code}</p>
                  <p className="text-sm text-[var(--pm-muted)]">
                    Role: {invite.role} · Used: {invite.usedCount}/{invite.maxUses}
                    {invite.expiresAt ? (
                      isExpired(invite.expiresAt) ? (
                        <span className="ml-2 text-[var(--pm-danger)]">Expired</span>
                      ) : (
                        <span className="ml-2">· Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                      )
                    ) : (
                      <span className="ml-2">· No expiration</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => revokeInvite(invite.id)}
                  disabled={isExpired(invite.expiresAt)}
                >
                  Revoke
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
