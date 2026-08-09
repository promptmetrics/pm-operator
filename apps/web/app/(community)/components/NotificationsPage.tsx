'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';
import { subscribeToUserNotifications, createRealtimeClient } from '@/lib/realtime';
import { timeAgo } from '@/lib/format';
import { notificationText, notificationHref } from './NotificationBell';
import { notificationTreatment, notificationContext } from './notification-presentation';
import type { Notification } from '@pm-operator/api';

interface NotificationsPageProps {
  currentUserId: string;
}

export function NotificationsPage({ currentUserId }: NotificationsPageProps) {
  const [items, setItems] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const client = React.useMemo(() => createRealtimeClient(), []);
  const { toast } = useToast();

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/v1/notifications?limit=50');
      if (!res.ok) throw new Error('request failed');
      const json = (await res.json()) as { data?: { notifications: Notification[] } };
      setItems(json.data?.notifications ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
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
    } else {
      toast({ title: 'Could not mark that as read', variant: 'error' });
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
    } else {
      toast({ title: 'Could not mark all as read', variant: 'error' });
    }
  };

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="mb-[18px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 font-serif text-[26px] font-semibold text-[var(--pm-ink)]">
            Notifications
          </h1>
          <p className="text-[13px] text-[var(--pm-muted)]">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start rounded-[var(--pm-radius-pill)] sm:self-auto"
            onClick={markAllRead}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      {loading ? (
        <ul className="flex flex-col gap-2" role="list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-[14px] border border-[var(--pm-line)] px-4 py-[14px]"
            >
              <span className="h-[34px] w-[34px] shrink-0 rounded-full bg-[var(--pm-paper-2)] motion-safe:animate-pulse" />
              <span className="flex-1 pt-1">
                <span className="block h-4 w-3/4 rounded bg-[var(--pm-paper-2)] motion-safe:animate-pulse" />
                <span className="mt-2 block h-3 w-1/3 rounded bg-[var(--pm-paper-2)] motion-safe:animate-pulse" />
              </span>
            </li>
          ))}
        </ul>
      ) : failed ? (
        <div className="rounded-[14px] border border-[var(--pm-danger)]/30 bg-[var(--pm-danger-bg)] p-8 text-center">
          <p className="font-serif text-lg font-semibold text-[var(--pm-ink)]">
            Couldn’t load notifications
          </p>
          <p className="mt-1 text-sm text-[var(--pm-ink)]">
            The request didn’t go through. Nothing was lost — try again.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={fetchAll}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[14px] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center shadow-[var(--pm-shadow)]">
          <p className="font-serif text-lg font-semibold text-[var(--pm-ink)]">
            No notifications yet
          </p>
          <p className="mt-1 text-sm text-[var(--pm-muted)]">
            When someone mentions you, replies to your post, or invites you to a circle, it’ll
            show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onMarkRead={markOneRead} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const unread = !n.readAt;
  const { icon: Icon, chipClassName } = notificationTreatment(n.type);
  const context = notificationContext(n);

  return (
    <li
      className={`flex items-start gap-3 rounded-[14px] border px-4 py-[14px] transition-colors ${
        unread
          ? 'border-[var(--pm-coral)]/25 bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]'
          : 'border-[var(--pm-line)] bg-transparent'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${chipClassName}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <Link
        href={notificationHref(n)}
        className="min-w-0 flex-1 rounded-[var(--pm-radius-sm)] focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
        onClick={() => {
          if (unread) onMarkRead(n.id);
        }}
      >
        <span className="block text-[13.5px] font-medium leading-[1.45] text-[var(--pm-ink)]">
          {notificationText(n)}
        </span>
        <span className="mt-[3px] block text-[11.5px] text-[var(--pm-muted-soft)]">
          {context ? `${context} · ` : ''}
          {timeAgo(n.createdAt)}
        </span>
      </Link>

      {unread ? (
        <span className="flex shrink-0 items-start gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Mark this notification as read"
            onClick={() => onMarkRead(n.id)}
          >
            Mark read
          </Button>
          <span
            className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-[var(--pm-coral)]"
            aria-hidden="true"
          />
        </span>
      ) : null}
    </li>
  );
}
