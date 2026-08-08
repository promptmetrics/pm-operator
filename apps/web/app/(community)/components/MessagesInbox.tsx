'use client';

import Link from 'next/link';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { timeAgo } from '@/lib/format';
import type { Conversation } from '@pm-operator/api';

interface MessagesInboxProps {
  conversations: Conversation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}

// Inbox column of the two-pane /messages layout. Presentational: MessagesTwoPane
// owns the fetch and the selection so the thread pane can swap without a
// navigation. Rows stay real <a href="/messages/:id"> so middle-click,
// cmd-click and copy-link still reach the deep-link route; a plain left click is
// intercepted and handled in place. prefetch is off — the rail costs a query on
// every RSC navigation, and hovering a 50-row inbox must not fan that out.
export function MessagesInbox({
  conversations,
  loading,
  selectedId,
  onSelect,
}: MessagesInboxProps) {
  if (loading) {
    return <p className="text-[var(--pm-muted)]">Loading...</p>;
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
        <p className="text-lg font-medium">No conversations yet</p>
        <p className="mt-1 text-sm text-[var(--pm-muted)]">
          Visit a profile and use the Message button to start a conversation.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="list">
      {conversations.map((c) => {
        const selected = c.id === selectedId;
        return (
          <li
            key={c.id}
            className={`rounded-xl border p-4 ${
              selected
                ? 'border-[var(--pm-coral)] bg-[var(--pm-coral-tint)]'
                : c.unreadCount > 0
                  ? 'border-[var(--pm-coral)]/30 bg-[var(--pm-coral-tint-10)]'
                  : 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]'
            }`}
          >
            <Link
              href={`/messages/${c.id}`}
              prefetch={false}
              aria-current={selected ? 'page' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onSelect(c);
              }}
              className="flex items-center gap-3"
            >
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
        );
      })}
    </ul>
  );
}
