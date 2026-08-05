'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';

const VISIBILITIES = ['public', 'invite_only', 'paid'] as const;

export default function AdminGroupSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [form, setForm] = React.useState({
    name: '',
    description: '',
    color: '',
    visibility: 'public' as string,
    requiredTierId: '',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`);
      if (!res.ok) throw new Error('Failed to load circle');
      const json = await res.json();
      const { group } = json.data;
      setData(json.data);
      setForm({
        name: group.name || '',
        description: group.description || '',
        color: group.color || '#3b82f6',
        visibility: group.visibility || 'public',
        requiredTierId: group.requiredTierId || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load circle');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          color: form.color,
          visibility: form.visibility,
          requiredTierId: form.requiredTierId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      toast({ title: 'Settings saved', variant: 'success' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to save settings', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteCircle = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete circle');
      toast({ title: 'Circle deleted', variant: 'success' });
      router.push('/admin/groups');
    } catch (err: any) {
      toast({ title: err.message || 'Failed to delete circle', variant: 'error' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl"><p className="text-[var(--pm-muted)]">Loading settings...</p></div>;
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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/admin/groups/${id}`} className="text-sm text-[var(--pm-coral)] hover:underline">
          &larr; {group.name}
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        <Link href={`/admin/groups/${id}`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Overview</Link>
        <Link href={`/admin/groups/${id}/members`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Members ({stats.members})</Link>
        <Link href={`/admin/groups/${id}/posts`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Posts ({stats.posts})</Link>
        <Link href={`/admin/groups/${id}/settings`} className="border-b-2 border-[var(--pm-coral)] px-4 py-2 text-sm font-medium text-[var(--pm-coral)]">Settings</Link>
        <Link href={`/admin/groups/${id}/invites`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Invites</Link>
      </div>

      {/* Edit form */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Circle settings</h2>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Color"
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium">Visibility</label>
            <select
              id="visibility"
              value={form.visibility}
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>{v.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save settings'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Danger zone */}
      <Card className="border-[var(--pm-danger)] p-6">
        <h2 className="mb-4 text-lg font-medium text-[var(--pm-danger)]">Danger zone</h2>
        <p className="mb-4 text-sm text-[var(--pm-muted)]">
          Deleting this circle will permanently remove all associated posts, comments, and memberships. This action cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete circle
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-[var(--pm-danger)]">Are you sure?</p>
            <Button variant="danger" onClick={deleteCircle} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Confirm delete'}
            </Button>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
