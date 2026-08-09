'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { Group, GroupVisibility } from '@pm-operator/api';
import { Search, LayoutGrid } from 'lucide-react';
import DataTable, { type Column } from '@/components/admin/DataTable';

const VISIBILITIES: GroupVisibility[] = ['public', 'invite_only', 'paid'];

type SortField = 'name' | 'memberCount' | 'createdAt';
type SortDir = 'asc' | 'desc';

export default function AdminGroupsPage() {
  const router = useRouter();
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

  // DataTable derives the next direction with the same rule the old header
  // buttons used: flip when the key is unchanged, otherwise start ascending.
  const handleSort = (key: string, dir: SortDir) => {
    setSortField(key as SortField);
    setSortDir(dir);
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

  // The whole row navigates (as the wrapping <Link> used to). The in-cell links
  // stop propagation so a click does not also fire the row handler.
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

  const columns: Column<Group>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (group) => (
        <div className="flex items-center gap-3">
          {group.color ? (
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
          ) : null}
          <Link
            href={`/admin/groups/${group.id}`}
            onClick={stopRowClick}
            className="truncate font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral)]"
          >
            {group.name}
          </Link>
        </div>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (group) => (
        <span className="font-mono text-xs text-[var(--pm-muted)]">/g/{group.slug}</span>
      ),
    },
    {
      key: 'memberCount',
      label: 'Members',
      sortable: true,
      align: 'right',
      render: (group) => (
        <span className="tabular-nums">{group.memberCount} members</span>
      ),
    },
    {
      key: 'visibility',
      label: 'Visibility',
      render: (group) => (
        <span className="capitalize">{group.visibility.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (group) => (
        <span className="whitespace-nowrap text-[var(--pm-muted)]">
          {new Date(group.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (group) => (
        <Link
          href={`/admin/groups/${group.id}`}
          onClick={stopRowClick}
          className="whitespace-nowrap text-sm text-[var(--pm-coral)] hover:text-[var(--pm-coral-dark)]"
        >
          View &rarr;
        </Link>
      ),
    },
  ];

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

      <DataTable<Group>
        caption="Circles"
        columns={columns}
        data={filtered}
        rowKey="id"
        sortKey={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(group) => router.push(`/admin/groups/${group.id}`)}
        loading={loading && groups.length === 0}
        emptyIcon={<LayoutGrid className="h-10 w-10" />}
        emptyMessage="No circles match your filters."
      />
    </div>
  );
}
