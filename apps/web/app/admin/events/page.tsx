'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { CalendarDays, List, Trash2, Calendar, Filter, Search } from 'lucide-react';
import type { Event } from '@pm-operator/api';
import DataTable, { type Column } from '@/components/admin/DataTable';
import LoadingState from '@/components/admin/LoadingState';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import EventCalendar, { type CalendarEvent } from '@/components/admin/EventCalendar';

// datetime-local gives "YYYY-MM-DDTHH:mm"; new Date(...).toISOString() yields a
// z.string().datetime()-compatible value for the API.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [view, setView] = React.useState<'list' | 'calendar'>('list');
  const [filterUpcoming, setFilterUpcoming] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [showCreateForm, setShowCreateForm] = React.useState(false);

  const [form, setForm] = React.useState({
    title: '',
    groupSlug: '',
    startsAt: '',
    endsAt: '',
    description: '',
    location: '',
    url: '',
    capacity: '',
    recurrence: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ upcoming: String(filterUpcoming), limit: '100' });
      const res = await fetch(`/api/v1/events?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load events');
      const json = (await res.json()) as { data?: { events: Event[] } };
      setEvents(json.data?.events ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [filterUpcoming]);

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
        recurrence: 'none',
      });
      setShowCreateForm(false);
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

  // Filter and sort
  const filtered = React.useMemo(() => {
    let result = [...events];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q) ||
          (e.location ?? '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return result;
  }, [events, search]);

  // Calendar events
  const calendarEvents: CalendarEvent[] = React.useMemo(
    () =>
      filtered.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        groupId: e.groupId,
        groupName: null,
      })),
    [filtered]
  );

  // No onSort is wired here — the list is always ordered by startsAt — so no
  // column is flagged sortable and no sort affordance is advertised.
  const columns: Column<Event>[] = [
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <button
          type="button"
          onClick={() => router.push(`/admin/events/${row.id}`)}
          className="font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral)]"
        >
          {row.title}
        </button>
      ),
    },
    {
      key: 'startsAt',
      label: 'Date/Time',
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-[var(--pm-muted)]">
          {new Date(row.startsAt).toLocaleDateString()}
          {' '}
          {new Date(row.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-sm text-[var(--pm-muted)]">{row.location || '-'}</span>
      ),
    },
    {
      key: 'capacity',
      label: 'Capacity',
      align: 'right',
      render: (row) => (
        <span className="text-sm tabular-nums">{row.capacity ? `${row.capacity}` : 'Unlimited'}</span>
      ),
    },
    {
      key: 'scope',
      label: 'Scope',
      render: (row) => (
        <span className="whitespace-nowrap rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-2 py-0.5 text-xs">
          {row.groupId ? 'Circle' : 'Global'}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-[var(--pm-line)] overflow-hidden">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${
                view === 'list'
                  ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                  : 'bg-[var(--pm-paper-inset)] text-[var(--pm-muted)] hover:text-[var(--pm-ink)]'
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${
                view === 'calendar'
                  ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                  : 'bg-[var(--pm-paper-inset)] text-[var(--pm-muted)] hover:text-[var(--pm-ink)]'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Calendar
            </button>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create event'}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="mb-4 text-sm text-[var(--pm-danger)]">{message}</p>
      ) : null}

      {/* Create event form */}
      {showCreateForm && (
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
              label="Circle slug (optional)"
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
            <div>
              <label className="mb-1 block text-sm font-medium">Recurrence</label>
              <select
                value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as typeof form.recurrence }))}
                className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
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
        </Card>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pm-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--pm-muted)]" />
          <button
            type="button"
            onClick={() => setFilterUpcoming(!filterUpcoming)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filterUpcoming
                ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                : 'bg-[var(--pm-paper-inset)] text-[var(--pm-muted)] hover:text-[var(--pm-ink)]'
            }`}
          >
            {filterUpcoming ? 'Upcoming' : 'Past'}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && events.length === 0 ? (
        <LoadingState rows={5} type="table" />
      ) : view === 'calendar' ? (
        <EventCalendar
          events={calendarEvents}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onEventClick={(ev) => router.push(`/admin/events/${ev.id}`)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="No events found"
          message={search ? 'Try a different search term.' : filterUpcoming ? 'No upcoming events.' : 'No past events.'}
          className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-16"
        />
      ) : (
        <DataTable<Event>
          caption="Events"
          columns={columns}
          data={filtered}
          rowKey="id"
          actions={[
            {
              label: 'Delete',
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              onClick: (row) => remove(row.id),
            },
          ]}
        />
      )}
    </div>
  );
}
