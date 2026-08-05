'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';

const ROLES = ['member', 'moderator', 'admin'] as const;

export default function AdminInvitesPage() {
  const { toast } = useToast();

  const [invites, setInvites] = React.useState<any[]>([]);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [form, setForm] = React.useState({
    groupId: '',
    maxUses: 1,
    expiresAt: '',
    role: 'member' as string,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const [invitesRes, groupsRes] = await Promise.all([
        fetch(`/api/v1/admin/invites?${params.toString()}`),
        fetch('/api/v1/admin/groups'),
      ]);
      if (!invitesRes.ok) throw new Error('Failed to load invites');
      const invitesJson = await invitesRes.json();
      setInvites(invitesJson.data?.invites ?? []);
      if (groupsRes.ok) {
        const groupsJson = await groupsRes.json();
        setGroups(groupsJson.data?.groups ?? []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.groupId) {
      toast({ title: 'Please select a circle', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId: form.groupId,
          maxUses: form.maxUses,
          expiresAt: form.expiresAt || undefined,
          role: form.role,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invite');
      toast({ title: 'Invite created', variant: 'success' });
      setForm({ groupId: '', maxUses: 1, expiresAt: '', role: 'member' });
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

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const totalUses = invites.reduce((sum: number, i: any) => sum + i.usedCount, 0);
  const totalMax = invites.reduce((sum: number, i: any) => sum + i.maxUses, 0);
  const acceptanceRate = totalMax > 0 ? Math.round((totalUses / totalMax) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Invites</h1>

      {/* Usage analytics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-[var(--pm-muted)]">Total invites</p>
          <p className="mt-1 text-2xl font-semibold">{invites.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--pm-muted)]">Total uses</p>
          <p className="mt-1 text-2xl font-semibold">{totalUses}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--pm-muted)]">Acceptance rate</p>
          <p className="mt-1 text-2xl font-semibold">{acceptanceRate}%</p>
        </Card>
      </div>

      {/* Create invite form */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Create invite code</h2>
        <form onSubmit={createInvite} className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="circle" className="mb-1 block text-sm font-medium">Circle</label>
            <select
              id="circle"
              value={form.groupId}
              onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
              required
            >
              <option value="">Select circle</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
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
          <div className="flex items-end sm:col-span-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create invite'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {error ? <p className="mb-4 text-[var(--pm-danger)]">{error}</p> : null}

      {loading && invites.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading invites...</p>
      ) : invites.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No invites found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {invites.map((invite: any) => (
            <Card key={invite.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{invite.code}</p>
                  <p className="text-sm text-[var(--pm-muted)]">
                    <Link href={`/admin/groups/${invite.groupId}`} className="hover:text-[var(--pm-coral)]">
                      {invite.groupName}
                    </Link>
                    {' · '}Role: {invite.role} · Used: {invite.usedCount}/{invite.maxUses}
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
