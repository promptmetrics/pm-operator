'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Button } from '@pm-operator/ui/components/Button';
import { timeAgo } from '@/lib/format';
import { useRealtimeConversation } from './RealtimeProvider';
import type { Conversation, Message } from '@pm-operator/api';

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  // 'page' is the standalone /messages/[id] deep-link route: centred column,
  // back link that navigates to /messages. 'pane' is the right-hand column of
  // the two-pane /messages layout: fills its parent, and back is a callback
  // that clears the selection (shown only below the two-pane breakpoint).
  variant?: 'page' | 'pane';
  onBack?: () => void;
}

export function MessageThread({
  conversationId,
  currentUserId,
  variant = 'page',
  onBack,
}: MessageThreadProps) {
  const router = useRouter();
  const [conversation, setConversation] = React.useState<Conversation | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState('');
  const [notFound, setNotFound] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // IDs of messages we just sent. The realtime channel fires onInsert for our
  // own inserts too (the filter is conversation_id only), so without this the
  // listener would refetch + markRead a second time for every self-sent message.
  // We record the id on send and skip it in the realtime listener.
  const sentIdsRef = React.useRef<Set<string>>(new Set());

  const fetchThread = React.useCallback(async () => {
    const [convRes, msgRes] = await Promise.all([
      fetch(`/api/v1/conversations/${conversationId}`),
      fetch(`/api/v1/conversations/${conversationId}/messages?limit=50`),
    ]);
    if (convRes.status === 404 || msgRes.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (convRes.ok) {
      const cj = (await convRes.json()) as { data?: Conversation };
      setConversation(cj.data ?? null);
    }
    if (msgRes.ok) {
      const mj = (await msgRes.json()) as { data?: { messages: Message[] } };
      setMessages(mj.data?.messages ?? []);
    }
    setLoading(false);
  }, [conversationId]);

  React.useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // Mark read on open (and when new messages arrive via realtime).
  const markRead = React.useCallback(async () => {
    await fetch(`/api/v1/conversations/${conversationId}/read`, { method: 'POST' });
  }, [conversationId]);

  React.useEffect(() => {
    markRead();
  }, [markRead]);

  // Realtime: refetch on any new message in this conversation. Stable via
  // useCallback so the hook's effect (whose deps include `listener`) doesn't
  // resubscribe on every render/keystroke. Skip our own just-sent messages —
  // send() already appended them and marked read, so the realtime echo would
  // only double-fire markRead and refetch redundantly.
  const handleNewMessage = React.useCallback(
    (messageId: string) => {
      if (sentIdsRef.current.has(messageId)) {
        sentIdsRef.current.delete(messageId);
        return;
      }
      fetchThread();
      markRead();
    },
    [fetchThread, markRead]
  );

  useRealtimeConversation(handleNewMessage, conversationId);

  // Scroll to bottom on load / new messages.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    setSendError('');
    try {
      const res = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Message };
        if (json.data) {
          sentIdsRef.current.add(json.data.id);
          setMessages((prev) => [...prev, json.data as Message]);
        }
        router.refresh();
        markRead();
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        // Non-ok, non-404 (500/403/429…): restore the unsent draft so the user
        // doesn't lose their text, and surface an error.
        setDraft(body);
        setSendError('Failed to send. Please try again.');
      }
    } catch {
      setDraft(body);
      setSendError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const pane = variant === 'pane';

  if (loading) {
    return <p className="text-[var(--pm-muted)]">Loading...</p>;
  }

  if (notFound) {
    return (
      <div className={pane ? '' : 'mx-auto max-w-3xl'}>
        <p className="text-[var(--pm-muted)]">Conversation not found.</p>
        {pane ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-[var(--pm-coral)] hover:underline"
          >
            Back to messages
          </button>
        ) : (
          <Link href="/messages" className="text-sm text-[var(--pm-coral)] hover:underline">
            Back to messages
          </Link>
        )}
      </div>
    );
  }

  const partner = conversation?.partner;

  return (
    <div
      data-testid="message-thread"
      className={pane ? 'flex h-full min-h-0 flex-col' : 'mx-auto flex max-w-3xl flex-col'}
      style={pane ? undefined : { minHeight: 'calc(100vh - 8rem)' }}
    >
      <div className="mb-4 flex items-center gap-3 border-b border-[var(--pm-line)] pb-3">
        {pane ? (
          // Only the single-pane layout needs a way back — above the breakpoint
          // the inbox is already on screen next to the thread.
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="Back to messages"
            className="min-[800px]:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Link href="/messages" aria-label="Back to messages">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <Avatar
          size="sm"
          className="h-9 w-9"
          src={partner?.pictureUrl ?? undefined}
          alt={partner?.username ?? ''}
          fallback={(partner?.fullName || partner?.username || '?').slice(0, 2).toUpperCase()}
        />
        <div>
          <p className="font-medium">
            {partner ? (
              <Link href={`/u/${partner.userslug}`} className="hover:underline">
                {partner.fullName || partner.username}
              </Link>
            ) : (
              'Deleted user'
            )}
          </p>
        </div>
      </div>

      {/* min-h-0 only in the pane: it makes the box itself scroll inside a
          fixed-height column. The page variant keeps its content-driven height
          so the whole page scrolls, exactly as before. */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 ${
          pane ? 'min-h-0' : ''
        }`}
      >
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--pm-muted)]">
            No messages yet. Say hello 👋
          </p>
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {messages.map((m) => {
              const mine = m.author?.id === currentUserId;
              return (
                <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                    mine
                      ? 'bg-[var(--pm-coral)] text-white'
                      : 'border border-[var(--pm-line)] bg-[var(--pm-paper-2)]'
                  }`}>
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-[var(--pm-muted)]'}`}>
                      {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sendError ? (
        <p role="alert" className="mt-3 text-sm text-[var(--pm-danger)]">
          {sendError}
        </p>
      ) : null}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message..."
          rows={2}
          maxLength={8000}
          className="flex-1 resize-none rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-3 py-2 text-sm outline-none focus:border-[var(--pm-coral)]"
        />
        <Button type="submit" variant="primary" size="md" disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}