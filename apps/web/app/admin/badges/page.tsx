'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { Award, Search, Filter, BarChart3, Users, Trophy } from 'lucide-react';
import type { Badge, BadgeCriteria, PointEventType } from '@pm-operator/api';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import BadgeCriteriaBuilder from '@/components/admin/BadgeCriteriaBuilder';

interface BadgeWithCount extends Badge {
  awardCount?: number;
}

export default function AdminBadgesPage() {
  const [badges, setBadges] = React.useState<BadgeWithCount[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [criteriaFilter, setCriteriaFilter] = React.useState<string>('all');
  const [sortKey, setSortKey] = React.useState('sortOrder');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);

  const [form, setForm] = React.useState({
    slug: '',
    name: '',
    description: '',
    iconUrl: '',
    sortOrder: 0,
  });
  const [criteria, setCriteria] = React.useState<BadgeCriteria>({
    eventType: 'topic_created',
    threshold: 1,
  });

  const [award, setAward] = React.useState<{ badgeId: string; userSlug: string; reason: string }>({
    badgeId: '',
    userSlug: '',
    reason: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/badges');
      if (!res.ok) throw new Error('Failed to load badges');
      const json = (await res.json()) as { data?: { badges: Badge[] } };
      const loaded = json.data?.badges ?? [];

      // Fetch award counts for each badge
      const badgesWithCounts: BadgeWithCount[] = await Promise.all(
        loaded.map(async (badge) => {
          try {
            const countRes = await fetch(`/api/v1/admin/badges/${badge.id}/count`);
            if (countRes.ok) {
              const countJson = (await countRes.json()) as { data?: { count: number } };
              return { ...badge, awardCount: countJson.data?.count ?? 0 };
            }
          } catch { /* ignore */ }
          return { ...badge, awardCount: 0 };
        })
      );

      setBadges(badgesWithCounts);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load badges');
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
      const res = await fetch('/api/v1/admin/badges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description,
          iconUrl: form.iconUrl || undefined,
          criteria,
          sortOrder: form.sortOrder,
        }),
      });
      if (!res.ok) throw new Error('Failed to create badge');
      setForm({ slug: '', name: '', description: '', iconUrl: '', sortOrder: 0 });
      setCriteria({ eventType: 'topic_created', threshold: 1 });
      setShowCreateForm(false);
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to create badge');
    } finally {
      setSaving(false);
    }
  };

  const awardBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/v1/admin/badges/${award.badgeId}/award`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userSlug: award.userSlug, reason: award.reason }),
      });
      if (!res.ok) throw new Error('Failed to award badge');
      setAward({ badgeId: '', userSlug: '', reason: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to award badge');
    } finally {
      setSaving(false);
    }
  };

  // Filter and sort
  const filtered = React.useMemo(() => {
    let result = [...badges];

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.slug.toLowerCase().includes(q) ||
          (b.description ?? '').toLowerCase().includes(q)
      );
    }

    // Criteria type filter
    if (criteriaFilter !== 'all') {
      if (criteriaFilter === 'streak') {
        result = result.filter((b) => 'type' in b.criteria && b.criteria.type === 'streak');
      } else {
        result = result.filter(
          (b) => !('type' in b.criteria && b.criteria.type === 'streak')
        );
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'sortOrder') cmp = a.sortOrder - b.sortOrder;
      else if (sortKey === 'awardCount') cmp = (a.awardCount ?? 0) - (b.awardCount ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [badges, search, criteriaFilter, sortKey, sortDir]);

  // Analytics data
  const analytics = React.useMemo(() => {
    const totalBadges = badges.length;
    const totalAwards = badges.reduce((sum, b) => sum + (b.awardCount ?? 0), 0);
    const mostAwarded = [...badges].sort((a, b) => (b.awardCount ?? 0) - (a.awardCount ?? 0)).slice(0, 5);
    return { totalBadges, totalAwards, mostAwarded };
  }, [badges]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Badges</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowAnalytics(!showAnalytics)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            {showAnalytics ? 'Hide analytics' : 'Analytics'}
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create badge'}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="mb-4 text-sm text-[var(--pm-danger)]">{message}</p>
      ) : null}

      {/* Analytics section */}
      {showAnalytics && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 text-lg font-medium">Badge Analytics</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
              <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                <Award className="h-4 w-4" />
                <span>Total badges</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{analytics.totalBadges}</p>
            </div>
            <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
              <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                <Users className="h-4 w-4" />
                <span>Total awards</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{analytics.totalAwards}</p>
            </div>
            <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
              <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                <Trophy className="h-4 w-4" />
                <span>Most awarded</span>
              </div>
              <div className="mt-1 space-y-1">
                {analytics.mostAwarded.slice(0, 3).map((b) => (
                  <p key={b.id} className="text-sm">
                    {b.name} <span className="text-[var(--pm-muted)]">({b.awardCount ?? 0})</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Create badge form */}
      {showCreateForm && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 text-lg font-medium">Create badge</h2>
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
              label="Icon URL"
              value={form.iconUrl}
              onChange={(e) => setForm((f) => ({ ...f, iconUrl: e.target.value }))}
            />
            <Input
              label="Sort order"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
            <div className="sm:col-span-2">
              <BadgeCriteriaBuilder value={criteria} onChange={setCriteria} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create badge'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Manual award form */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Manual award</h2>
        <form onSubmit={awardBadge} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="badge" className="mb-1 block text-sm font-medium">Badge</label>
            <select
              id="badge"
              value={award.badgeId}
              onChange={(e) => setAward((a) => ({ ...a, badgeId: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
              required
            >
              <option value="">Select badge</option>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="User slug"
            value={award.userSlug}
            onChange={(e) => setAward((a) => ({ ...a, userSlug: e.target.value }))}
            required
          />
          <Input
            label="Reason"
            value={award.reason}
            onChange={(e) => setAward((a) => ({ ...a, reason: e.target.value }))}
          />
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Awarding...' : 'Award badge'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Search and filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pm-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search badges..."
            className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--pm-muted)]" />
          <select
            value={criteriaFilter}
            onChange={(e) => setCriteriaFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
          >
            <option value="all">All criteria</option>
            <option value="count">Event count</option>
            <option value="streak">Streak</option>
          </select>
        </div>
        <select
          value={`${sortKey}-${sortDir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split('-') as [string, 'asc' | 'desc'];
            setSortKey(key);
            setSortDir(dir);
          }}
          className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
        >
          <option value="sortOrder-asc">Sort order</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="awardCount-desc">Most awarded</option>
          <option value="awardCount-asc">Least awarded</option>
        </select>
      </div>

      {/* Badge grid */}
      {loading && badges.length === 0 ? (
        <LoadingState rows={5} type="card" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Award className="h-12 w-12" />}
          title="No badges found"
          message={search ? 'Try a different search term.' : 'No badges have been created yet.'}
          className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-16"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((badge) => (
            <Card key={badge.id} className="p-4">
              <CardContent>
                <div className="flex items-start gap-3">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt="" className="h-10 w-10 rounded" />
                  ) : (
                    <Award className="h-10 w-10 text-[var(--pm-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{badge.name}</p>
                    <p className="text-xs text-[var(--pm-muted)]">{badge.slug}</p>
                    <p className="mt-1 text-sm text-[var(--pm-ink)]">
                      {badge.description || 'No description'}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--pm-muted)]">
                      <span className="rounded-full bg-[var(--pm-paper-2)] px-2 py-0.5">
                        {(() => {
                          const c = badge.criteria as Record<string, unknown>;
                          if ('type' in c && c.type === 'streak') return `${c.days}-day streak`;
                          return `${c.eventType} × ${c.threshold}`;
                        })()}
                      </span>
                      <span>{badge.awardCount ?? 0} awarded</span>
                    </div>
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
