'use client';

import * as React from 'react';
import { MessagesInbox } from './MessagesInbox';
import { MessageThread } from './MessageThread';
import type { Conversation } from '@pm-operator/api';

interface MessagesTwoPaneProps {
  currentUserId: string;
}

/**
 * /messages: inbox and thread side by side.
 *
 * The split is pure CSS at an 800px breakpoint — no matchMedia, so the
 * server and client markup agree and there is no hydration flash:
 *   - 800px and up: the inbox column is always shown; the thread pane holds
 *     either the selected conversation or the "nothing selected" placeholder.
 *   - below 800px: exactly one pane is visible. No selection shows the inbox;
 *     a selection shows the thread, whose back button clears it.
 *
 * Selecting a conversation is React state only — no router.push — so the pane
 * swaps without an RSC navigation (which would re-run the layout's rail query).
 * /messages/[id] stays the deep-link route and is untouched; inbox rows remain
 * real anchors pointing at it.
 */
export function MessagesTwoPane({ currentUserId }: MessagesTwoPaneProps) {
  const [items, setItems] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Same single request the inbox has always made.
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

  // Opening a thread marks it read server-side (MessageThread POSTs /read), so
  // clear the badge locally rather than refetching the whole inbox.
  const handleSelect = React.useCallback((conversation: Conversation) => {
    setSelectedId(conversation.id);
    setItems((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleBack = React.useCallback(() => setSelectedId(null), []);

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-[var(--pm-muted)]">Your private conversations</p>
      </div>

      <div
        className="flex min-h-0 gap-4 min-[800px]:gap-6"
        style={{ height: 'calc(100dvh - 12rem)', minHeight: '24rem' }}
      >
        <div
          data-testid="messages-inbox"
          className={`w-full shrink-0 overflow-y-auto min-[800px]:block min-[800px]:w-[300px] ${
            selectedId ? 'hidden' : 'block'
          }`}
        >
          <MessagesInbox
            conversations={items}
            loading={loading}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        <div
          data-testid="messages-thread-pane"
          className={`min-w-0 flex-1 ${selectedId ? 'block' : 'hidden min-[800px]:block'}`}
        >
          {selectedId ? (
            // Keyed so switching conversations resets messages/draft/realtime
            // rather than leaking the previous thread's state.
            <MessageThread
              key={selectedId}
              conversationId={selectedId}
              currentUserId={currentUserId}
              variant="pane"
              onBack={handleBack}
            />
          ) : loading ? null : (
            <div className="flex h-full items-center justify-center rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
              <div>
                <p className="text-lg font-medium">
                  {items.length === 0 ? 'Nothing to read yet' : 'No conversation selected'}
                </p>
                <p className="mt-1 text-sm text-[var(--pm-muted)]">
                  {items.length === 0
                    ? 'Visit a profile and use the Message button to start a conversation.'
                    : 'Pick a conversation on the left to read it and reply.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
