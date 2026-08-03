'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { subscribeToUserNotifications, createRealtimeClient } from '@/lib/realtime';
import type { Notification } from '@pm-operator/api';

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [count, setCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notification[]>([]);
  const client = React.useMemo(() => createRealtimeClient(), []);
  const liveRegionRef = React.useRef<HTMLDivElement>(null);

  const fetchUnread = React.useCallback(async () => {
    const res = await fetch('/api/v1/notifications?unreadOnly=true&limit=50');
    if (!res.ok) return;
    const json = (await res.json()) as { data?: { notifications: Notification[] } };
    const notifications = json.data?.notifications ?? [];
    setItems(notifications);
    setCount(notifications.filter((n) => !n.readAt).length);
  }, []);

  React.useEffect(() => {
    fetchUnread();

    const unsub = subscribeToUserNotifications<Notification>(
      userId,
      {
        onInsert: (notification) => {
          setItems((prev) => [notification, ...prev]);
          setCount((c) => c + 1);
        },
      },
      { client }
    );

    return () => {
      unsub();
    };
  }, [userId, client, fetchUnread]);

  React.useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = `Notifications, ${count} unread`;
    }
  }, [count]);

  const markAllRead = async () => {
    const res = await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    }
  };

  return (
    <div className="relative">
      <div ref={liveRegionRef} className="sr-only" aria-live="polite" aria-atomic="true" />
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Notifications, ${count} unread`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--pm-danger)] px-1 text-[10px] font-medium text-[var(--pm-on-ink)]">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 shadow-lg">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-semibold">Notifications</span>
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Mark all read
            </Button>
          </div>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto" role="list">
            {items.slice(0, 5).map((n) => (
              <li key={n.id}>
                <Link
                  href={notificationHref(n)}
                  className="block rounded-lg p-2 text-sm hover:bg-[var(--pm-paper-2)]"
                  onClick={() => setOpen(false)}
                >
                  {!n.readAt ? (
                    <span className="mb-1 block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                  <span className="text-[var(--pm-muted)]">{notificationText(n)}</span>
                  <span className="block text-xs text-[var(--pm-muted)]">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
            {items.length === 0 ? (
              <li className="p-2 text-sm text-[var(--pm-muted)]">No notifications</li>
            ) : null}
          </ul>
          <div className="border-t border-[var(--pm-line)] pt-2">
            <Link
              href="/notifications"
              className="block text-center text-sm text-[var(--pm-coral)] hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function notificationText(n: Notification): string {
  switch (n.type) {
    case 'comment':
      return 'New comment on your post';
    case 'reaction':
      return 'New reaction on your content';
    case 'solution':
      return 'Your answer was accepted as the solution';
    case 'invite':
      return 'You were invited to a circle';
    case 'flag':
      return 'Your content was flagged';
    case 'flag_resolved':
      return 'A flag on your content was resolved';
    case 'mention':
      return 'Someone mentioned you';
    case 'badge':
      return 'You earned a new badge';
    case 'new_follower':
      return n.payload.actorUsername
        ? `${n.payload.actorUsername} started following you`
        : 'Someone followed you';
    case 'new_message':
      return n.payload.actorUsername
        ? `${n.payload.actorUsername} sent you a message`
        : 'You have a new message';
    default:
      return 'New notification';
  }
}

export function notificationHref(n: Notification): string {
  const p = n.payload;
  if (p.conversationId) return `/messages/${p.conversationId}`;
  if (p.groupSlug && p.postSlug) return `/g/${p.groupSlug}/${p.postSlug}`;
  if (p.groupSlug) return `/g/${p.groupSlug}`;
  if (p.postId) return `/p/${p.postId}`;
  if (p.actorSlug) return `/u/${p.actorSlug}`;
  return '/notifications';
}
