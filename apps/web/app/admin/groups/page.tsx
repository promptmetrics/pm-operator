'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { Group, GroupVisibility } from '@pm-operator/api';

const VISIBILITIES: GroupVisibility[] = ['public', 'invite_only', 'paid'];

export default function AdminGroupsPage() {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({
    slug: '',
    name: '',
    description: '',
    visibility: 'public' as GroupVisibility,
    color: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      const json = (await res.json()) as { data?: { groups: Group[] } };
      setGroups(json.data?.groups ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/admin/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create group');
      setForm({ slug: '', name: '', description: '', visibility: 'public', color: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Circles</h1>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Create circle</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            required
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input
            label="Color"
            type="color"
            value={form.color || '#3b82f6'}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          />
          <div>
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium">Visibility</label>
            <select
              id="visibility"
              value={form.visibility}
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as GroupVisibility }))}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3"
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create circle'}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-error">{message}</p> : null}
      </Card>

      {loading && groups.length === 0 ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <Card key={group.id} className="p-4">
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {group.color ? (
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: group.color }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-muted-foreground">
                      /g/{group.slug} · {group.visibility} · {group.memberCount} members
                    </p>
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
