'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { Badge, BadgeCriteria, PointEventType } from '@pm-operator/api';

const EVENT_TYPES: PointEventType[] = [
  'topic_created',
  'comment_created',
  'solution_accepted',
  'like_received',
  'like_given',
  'invite_accepted',
  'daily_visit',
  'posts_read',
  'manual_award',
];

const POST_TYPES = ['discussion', 'question', 'build', 'lesson'] as const;

export default function AdminBadgesPage() {
  const [badges, setBadges] = React.useState<Badge[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({
    slug: '',
    name: '',
    description: '',
    iconUrl: '',
    eventType: 'topic_created' as PointEventType,
    threshold: 1,
    postType: '' as '' | typeof POST_TYPES[number],
    groupSlug: '',
    sortOrder: 0,
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
      setBadges(json.data?.badges ?? []);
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

    const criteria: BadgeCriteria = {
      eventType: form.eventType,
      threshold: form.threshold,
      ...(form.postType ? { postType: form.postType } : {}),
      ...(form.groupSlug ? { groupSlug: form.groupSlug } : {}),
    };

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
      setForm({
        slug: '',
        name: '',
        description: '',
        iconUrl: '',
        eventType: 'topic_created',
        threshold: 1,
        postType: '',
        groupSlug: '',
        sortOrder: 0,
      });
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
    } catch (err: any) {
      setMessage(err.message || 'Failed to award badge');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Badges</h1>

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
          <div>
            <label htmlFor="eventType" className="mb-1 block text-sm font-medium">Event type</label>
            <select
              id="eventType"
              value={form.eventType}
              onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value as PointEventType }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Input
            label="Threshold"
            type="number"
            min={1}
            value={form.threshold}
            onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) }))}
          />
          <div>
            <label htmlFor="postType" className="mb-1 block text-sm font-medium">Post type (optional)</label>
            <select
              id="postType"
              value={form.postType}
              onChange={(e) => setForm((f) => ({ ...f, postType: e.target.value as typeof POST_TYPES[number] | '' }))}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              <option value="">Any</option>
              {POST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Input
            label="Group slug (optional)"
            value={form.groupSlug}
            onChange={(e) => setForm((f) => ({ ...f, groupSlug: e.target.value }))}
          />
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
          />
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create badge'}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-[var(--pm-danger)]">{message}</p> : null}
      </Card>

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

      {loading && badges.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {badges.map((badge) => (
            <Card key={badge.id} className="p-4">
              <CardContent>
                <div className="flex items-center gap-3">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt="" className="h-8 w-8 rounded" />
                  ) : null}
                  <div>
                    <p className="font-medium">{badge.name}</p>
                    <p className="text-sm text-[var(--pm-muted)]">
                      {badge.description || 'No description'} ·{' '}
                      {'days' in badge.criteria
                        ? `${badge.criteria.days}-day streak`
                        : `${badge.criteria.eventType} · threshold ${badge.criteria.threshold}`}
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
