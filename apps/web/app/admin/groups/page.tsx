'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { Group, GroupVisibility } from '@pm-operator/api';
import { Search, ArrowUpDown } from 'lucide-react';

const VISIBILITIES: GroupVisibility[] = ['public', 'invite_only', 'paid'];

type SortField = 'name' | 'memberCount' | 'createdAt';
type SortDir = 'asc' | 'desc';

export default function AdminGroupsPage() {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [visibilityFilter, setVisibilityFilter] = React.useState('');
  const [sortField, setSortField] = React.useState<SortField>('name');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = groups
    .filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        if (!g.name.toLowerCase().includes(q) && !g.slug.toLowerCase().includes(q)) return false;
      }
      if (visibilityFilter && g.visibility !== visibilityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'memberCount') cmp = a.memberCount - b.memberCount;
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
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
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
        {message ? <p className="mt-4 text-sm text-[var(--pm-danger)]">{message}</p> : null}
      </Card>

      {/* Search and filter */}
      <Card className="mb-6 p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pm-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug..."
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] pl-10 pr-3 text-sm"
            />
          </div>
          <div>
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
              className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
            >
              <option value="">All visibility</option>
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>{v.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading && groups.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No circles match your filters.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Table header */}
          <div className="hidden grid-cols-12 gap-4 px-4 sm:grid">
            <div className="col-span-3"><SortHeader field="name" label="Name" /></div>
            <div className="col-span-2 text-sm text-[var(--pm-muted)]">Slug</div>
            <div className="col-span-2"><SortHeader field="memberCount" label="Members" /></div>
            <div className="col-span-2 text-sm text-[var(--pm-muted)]">Visibility</div>
            <div className="col-span-2"><SortHeader field="createdAt" label="Created" /></div>
            <div className="col-span-1" />
          </div>

          {filtered.map((group) => (
            <Link key={group.id} href={`/admin/groups/${group.id}`}>
              <Card className="cursor-pointer p-4 transition-colors hover:border-[var(--pm-coral)]">
                <CardContent>
                  <div className="grid grid-cols-12 items-center gap-4">
                    <div className="col-span-12 flex items-center gap-3 sm:col-span-3">
                      {group.color ? (
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: group.color }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <p className="truncate font-medium">{group.name}</p>
                    </div>
                    <div className="col-span-4 text-sm text-[var(--pm-muted)] sm:col-span-2">
                      /g/{group.slug}
                    </div>
                    <div className="col-span-2 text-sm sm:col-span-2">
                      {group.memberCount} members
                    </div>
                    <div className="col-span-3 text-sm capitalize sm:col-span-2">
                      {group.visibility.replace('_', ' ')}
                    </div>
                    <div className="col-span-2 text-sm text-[var(--pm-muted)] sm:col-span-2">
                      {new Date(group.createdAt).toLocaleDateString()}
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-sm text-[var(--pm-coral)]">View &rarr;</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
