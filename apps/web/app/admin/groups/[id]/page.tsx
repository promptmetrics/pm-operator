'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { Users, MessageSquare, FileText, Activity } from 'lucide-react';

export default function AdminGroupDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/groups/${id}`);
      if (!res.ok) throw new Error('Failed to load circle');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load circle');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-[var(--pm-muted)]">Loading circle...</p>
      </div>
    );
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
        <Link href="/admin/groups" className="text-sm text-[var(--pm-coral)] hover:underline">
          &larr; Circles
        </Link>
        <h1 className="text-2xl font-semibold">
          {group.color ? (
            <span className="mr-2 inline-block h-4 w-4 rounded-full" style={{ backgroundColor: group.color }} />
          ) : null}
          {group.name}
        </h1>
        <span className="rounded-full bg-[var(--pm-muted)]/20 px-2 py-0.5 text-xs text-[var(--pm-muted)]">
          /g/{group.slug}
        </span>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <CardContent>
            <div className="flex items-center gap-2 text-[var(--pm-muted)]">
              <Users className="h-4 w-4" />
              <span className="text-sm">Members</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{stats.members}</p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent>
            <div className="flex items-center gap-2 text-[var(--pm-muted)]">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Posts</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{stats.posts}</p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent>
            <div className="flex items-center gap-2 text-[var(--pm-muted)]">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">Comments</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{stats.comments}</p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent>
            <div className="flex items-center gap-2 text-[var(--pm-muted)]">
              <Activity className="h-4 w-4" />
              <span className="text-sm">30-day activity</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{stats.activity30d}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        <Link
          href={`/admin/groups/${id}`}
          className="border-b-2 border-[var(--pm-coral)] px-4 py-2 text-sm font-medium text-[var(--pm-coral)]"
        >
          Overview
        </Link>
        <Link
          href={`/admin/groups/${id}/members`}
          className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
        >
          Members ({stats.members})
        </Link>
        <Link
          href={`/admin/groups/${id}/posts`}
          className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
        >
          Posts ({stats.posts})
        </Link>
        <Link
          href={`/admin/groups/${id}/settings`}
          className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
        >
          Settings
        </Link>
        <Link
          href={`/admin/groups/${id}/invites`}
          className="px-4 py-2 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
        >
          Invites
        </Link>
      </div>

      {/* Overview content */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-medium">Circle info</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-[var(--pm-muted)]">Slug</p>
            <p className="font-medium">/g/{group.slug}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--pm-muted)]">Visibility</p>
            <p className="font-medium capitalize">{group.visibility?.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--pm-muted)]">Created</p>
            <p className="font-medium">{new Date(group.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--pm-muted)]">Description</p>
            <p className="font-medium">{group.description || 'No description'}</p>
          </div>
        </div>
      </Card>

      {/* Recent members */}
      {members && members.length > 0 && (
        <Card className="mt-6 p-6">
          <h2 className="mb-4 text-lg font-medium">Recent members</h2>
          <div className="flex flex-col gap-3">
            {members.slice(0, 10).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.pictureUrl ? (
                    <img src={m.pictureUrl} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pm-muted)]/20 text-sm">
                      {m.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{m.username}</p>
                    <p className="text-xs text-[var(--pm-muted)]">
                      {m.role} · joined {new Date(m.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
