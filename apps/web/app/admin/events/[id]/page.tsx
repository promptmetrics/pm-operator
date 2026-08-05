'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { ArrowLeft, CalendarDays, MapPin, Globe, Users, Trash2, Pencil } from 'lucide-react';
import LoadingState from '@/components/admin/LoadingState';
import ErrorState from '@/components/admin/ErrorState';
import type { Event } from '@pm-operator/api';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [event, setEvent] = React.useState<Event | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({
    title: '',
    description: '',
    startsAt: '',
    endsAt: '',
    location: '',
    url: '',
    capacity: '',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/events/${id}`);
      if (!res.ok) throw new Error('Event not found');
      const json = (await res.json()) as { data?: Event };
      const ev = json.data ?? null;
      setEvent(ev);
      if (ev) {
        setForm({
          title: ev.title,
          description: ev.description ?? '',
          startsAt: toLocalInput(ev.startsAt),
          endsAt: ev.endsAt ? toLocalInput(ev.endsAt) : '',
          location: ev.location ?? '',
          url: ev.url ?? '',
          capacity: ev.capacity ? String(ev.capacity) : '',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = { title: form.title };
      if (form.description) body.description = form.description;
      if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
      if (form.endsAt) body.endsAt = new Date(form.endsAt).toISOString();
      if (form.location) body.location = form.location;
      if (form.url) body.url = form.url;
      if (form.capacity) body.capacity = Number(form.capacity);

      const res = await fetch(`/api/v1/events/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update event');
      setEditing(false);
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to update event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this event? This action cannot be undone.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      router.push('/admin/events');
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete event');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={3} type="card" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!event) return <ErrorState message="Event not found" />;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push('/admin/events')}
        className="mb-4 flex items-center gap-2 text-sm text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to events
      </button>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{editing ? 'Edit event' : event.title}</h1>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="secondary" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {message ? (
        <p className={`mb-4 text-sm ${message.includes('reset') ? 'text-green-600' : 'text-[var(--pm-danger)]'}`}>
          {message}
        </p>
      ) : null}

      {editing ? (
        <Card className="p-6">
          <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
              <Button variant="secondary" onClick={() => { setEditing(false); load(); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          {/* Event info */}
          <Card className="mb-6 p-6">
            <CardContent>
              <div className="space-y-4">
                {event.description && (
                  <p className="text-sm text-[var(--pm-ink)]">{event.description}</p>
                )}

                <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    {new Date(event.startsAt).toLocaleDateString(undefined, {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    })}
                    {' at '}
                    {new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {event.endsAt ? (
                      <> &mdash; {new Date(event.endsAt).toLocaleDateString(undefined, {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      })}</>
                    ) : null}
                  </span>
                </div>

                {event.location && (
                  <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                    <MapPin className="h-4 w-4" />
                    <span>{event.location}</span>
                  </div>
                )}

                {event.url && (
                  <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                    <Globe className="h-4 w-4" />
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-[var(--pm-coral)] hover:underline">
                      {event.url}
                    </a>
                  </div>
                )}

                {event.capacity && (
                  <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                    <Users className="h-4 w-4" />
                    <span>Capacity: {event.capacity}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                  <span className="font-medium">Circle:</span>
                  <span>{event.groupId ? 'Circle-scoped' : 'Global event'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RSVP list placeholder */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-medium">RSVPs</h2>
            <p className="text-sm text-[var(--pm-muted)]">
              RSVP tracking will be available in a future update.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
