'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { Trash2 } from 'lucide-react';
import type { Event } from '@pm-operator/api';

// datetime-local gives "YYYY-MM-DDTHH:mm"; new Date(...).toISOString() yields a
// z.string().datetime()-compatible value for the API.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventsPage() {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({
    title: '',
    groupSlug: '',
    startsAt: '',
    endsAt: '',
    description: '',
    location: '',
    url: '',
    capacity: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/events?upcoming=true&limit=100');
      if (!res.ok) throw new Error('Failed to load events');
      const json = (await res.json()) as { data?: { events: Event[] } };
      setEvents(json.data?.events ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startsAt) {
      setMessage('Start date is required');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        startsAt: new Date(form.startsAt).toISOString(),
      };
      if (form.groupSlug) body.groupSlug = form.groupSlug;
      if (form.endsAt) body.endsAt = new Date(form.endsAt).toISOString();
      if (form.description) body.description = form.description;
      if (form.location) body.location = form.location;
      if (form.url) body.url = form.url;
      if (form.capacity) body.capacity = Number(form.capacity);

      const res = await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson = (await res.json()) as { error?: { message?: string } };
        throw new Error(errJson.error?.message || 'Failed to create event');
      }
      setForm({
        title: '',
        groupSlug: '',
        startsAt: '',
        endsAt: '',
        description: '',
        location: '',
        url: '',
        capacity: '',
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const res = await fetch(`/api/v1/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete event');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Events</h1>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Create event</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            label="Circle slug (optional — leave blank for a global event)"
            value={form.groupSlug}
            onChange={(e) => setForm((f) => ({ ...f, groupSlug: e.target.value }))}
          />
          <Input
            label="Starts at"
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            required
          />
          <Input
            label="Ends at (optional)"
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          />
          <Input
            label="Location (optional)"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <Input
            label="URL (optional)"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          />
          <Input
            label="Capacity (optional)"
            type="number"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create event'}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-[var(--pm-danger)]">{message}</p> : null}
      </Card>

      {loading && events.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-[var(--pm-muted)]">No upcoming events.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <Card key={event.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="font-medium">{event.title}</p>
                <p className="text-sm text-[var(--pm-muted)]">
                  {new Date(event.startsAt).toLocaleString()}
                  {event.location ? ` · ${event.location}` : ''}
                  {event.groupId ? ' · circle-scoped' : ' · global'}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => remove(event.id)}
                aria-label="Delete event"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}