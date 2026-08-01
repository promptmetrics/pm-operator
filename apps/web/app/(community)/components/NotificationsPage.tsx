'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { subscribeToUserNotifications, createRealtimeClient } from '@/lib/realtime';
import { notificationText, notificationHref } from './NotificationBell';
import type { Notification } from '@pm-operator/api';

interface NotificationsPageProps {
  currentUserId: string;
}

export function NotificationsPage({ currentUserId }: NotificationsPageProps) {
  const [items, setItems] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const client = React.useMemo(() => createRealtimeClient(), []);

  const fetchAll = React.useCallback(async () => {
    const res = await fetch('/api/v1/notifications?limit=50');
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { data?: { notifications: Notification[] } };
    const notifications = json.data?.notifications ?? [];
    setItems(notifications);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchAll();

    const unsub = subscribeToUserNotifications<Notification>(
      currentUserId,
      {
        onInsert: (notification) => {
          setItems((prev) => [notification, ...prev]);
        },
      },
      { client }
    );

    return () => {
      unsub();
    };
  }, [currentUserId, client, fetchAll]);

  const markOneRead = async (id: string) => {
    const res = await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
      );
    }
  };

  const markAllRead = async () => {
    const res = await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    }
  };

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          {unreadCount > 0 ? (
            <p className="text-sm text-[var(--pm-muted)]">{unreadCount} unread</p>
          ) : null}
        </div>
        {items.some((n) => !n.readAt) ? (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
          <p className="text-lg font-medium">No notifications yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${
                n.readAt ? 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]' : 'border-[var(--pm-coral)]/30 bg-[var(--pm-coral-tint-10)]'
              }`}
            >
              <Link
                href={notificationHref(n)}
                className="flex-1"
                onClick={() => {
                  if (!n.readAt) markOneRead(n.id);
                }}
              >
                <p className="text-sm font-medium">{notificationText(n)}</p>
                <p className="mt-1 text-xs text-[var(--pm-muted)]">
                  {new Date(n.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </Link>
              {!n.readAt ? (
                <Button variant="ghost" size="sm" onClick={() => markOneRead(n.id)}>
                  Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
