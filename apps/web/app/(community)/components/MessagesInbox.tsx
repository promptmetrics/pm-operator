'use client';

import * as React from 'react';
import Link from 'next/link';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { timeAgo } from '@/lib/format';
import type { Conversation } from '@pm-operator/api';

export function MessagesInbox() {
  const [items, setItems] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchAll = React.useCallback(async () => {
    const res = await fetch('/api/v1/conversations?limit=50');
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { data?: { conversations: Conversation[] } };
    setItems(json.data?.conversations ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-[var(--pm-muted)]">Your private conversations</p>
      </div>

      {loading ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
          <p className="text-lg font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-[var(--pm-muted)]">
            Visit a profile and use the Message button to start a conversation.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {items.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border p-4 ${
                c.unreadCount > 0
                  ? 'border-[var(--pm-coral)]/30 bg-[var(--pm-coral-tint-10)]'
                  : 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]'
              }`}
            >
              <Link href={`/messages/${c.id}`} className="flex items-center gap-3">
                <Avatar
                  size="md"
                  className="h-10 w-10"
                  src={c.partner?.pictureUrl ?? undefined}
                  alt={c.partner?.username ?? ''}
                  fallback={(c.partner?.fullName || c.partner?.username || '?').slice(0, 2).toUpperCase()}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {c.partner ? c.partner.fullName || c.partner.username : 'Deleted user'}
                    </p>
                    {c.lastMessageAt ? (
                      <span className="shrink-0 text-xs text-[var(--pm-muted)]">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    ) : null}
                  </div>
                  {c.lastMessagePreview ? (
                    <p className="mt-0.5 truncate text-sm text-[var(--pm-muted)]">{c.lastMessagePreview}</p>
                  ) : (
                    <p className="mt-0.5 text-sm text-[var(--pm-muted)]">No messages yet</p>
                  )}
                </div>
                {c.unreadCount > 0 ? (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pm-coral)] px-1.5 text-xs font-semibold text-white">
                    {c.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}