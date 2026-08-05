'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';

const STATUSES = ['published', 'flagged', 'hidden', 'draft'] as const;
const TYPES = ['discussion', 'question', 'build', 'lesson'] as const;

export default function AdminGroupPostsPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`);
      if (!res.ok) throw new Error('Failed to load posts');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="mx-auto max-w-5xl"><p className="text-[var(--pm-muted)]">Loading posts...</p></div>;
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
        <h1 className="text-2xl font-semibold">Posts</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        <Link href={`/admin/groups/${id}`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Overview</Link>
        <Link href={`/admin/groups/${id}/members`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Members ({stats.members})</Link>
        <Link href={`/admin/groups/${id}/posts`} className="border-b-2 border-[var(--pm-coral)] px-4 py-2 text-sm font-medium text-[var(--pm-coral)]">Posts ({stats.posts})</Link>
        <Link href={`/admin/groups/${id}/settings`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Settings</Link>
        <Link href={`/admin/groups/${id}/invites`} className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]">Invites</Link>
      </div>

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
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-sm font-medium">Type</label>
          <select
            id="type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[var(--pm-muted)]">
        Post list with filtering will be available once the dedicated posts API endpoint is connected.
      </p>
    </div>
  );
}
