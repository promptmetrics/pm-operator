'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  createRealtimeClient,
  subscribeToGroupPosts,
  subscribeToPostComments,
  subscribeToConversation,
  type RealtimeChannelStatus,
} from '@/lib/realtime';

type PostListener = (postId: string) => void;
type CommentListener = (commentId: string) => void;
type MessageListener = (messageId: string) => void;

interface RealtimeContextValue {
  subscribeGroup: (slug: string, listener: PostListener) => () => void;
  subscribePost: (postId: string, listener: CommentListener) => () => void;
  subscribeConversation: (conversationId: string, listener: MessageListener) => () => void;
}

// T8.8: aggregate realtime channel state for the visible status dot. The old
// sr-only region always announced "Live updates enabled" even when the channel
// had errored silently; this replaces it with a real connected/connecting/error
// view driven by Supabase's subscribe status.
type RealtimeStatus = 'connecting' | 'connected' | 'error';

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export function useRealtimeGroup(listener: PostListener, slug?: string) {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtimeGroup must be used inside RealtimeProvider');
  React.useEffect(() => {
    if (!slug) return;
    return ctx.subscribeGroup(slug, listener);
  }, [ctx, slug, listener]);
}

export function useRealtimePost(listener: CommentListener, postId?: string) {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtimePost must be used inside RealtimeProvider');
  React.useEffect(() => {
    if (!postId) return;
    return ctx.subscribePost(postId, listener);
  }, [ctx, postId, listener]);
}

export function useRealtimeConversation(listener: MessageListener, conversationId?: string) {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtimeConversation must be used inside RealtimeProvider');
  React.useEffect(() => {
    if (!conversationId) return;
    return ctx.subscribeConversation(conversationId, listener);
  }, [ctx, conversationId, listener]);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const client = React.useMemo(() => createRealtimeClient(), []);

  const groupListeners = React.useRef(new Map<string, Set<PostListener>>());
  const groupUnsubs = React.useRef(new Map<string, () => void>());
  const postListeners = React.useRef(new Map<string, Set<CommentListener>>());
  const postUnsubs = React.useRef(new Map<string, () => void>());
  const conversationListeners = React.useRef(new Map<string, Set<MessageListener>>());
  const conversationUnsubs = React.useRef(new Map<string, () => void>());

  // Per-channel state keyed by slug / postId. A channel is "connecting" from
  // creation until Supabase reports SUBSCRIBED; CHANNEL_ERROR / TIMED_OUT /
  // CLOSED collapse to "error".
  const channelStates = React.useRef(new Map<string, RealtimeStatus>());
  const [status, setStatus] = React.useState<RealtimeStatus>('connecting');

  const recomputeStatus = React.useCallback(() => {
    const states = [...channelStates.current.values()];
    if (states.length === 0) {
      setStatus('connecting');
      return;
    }
    if (states.some((s) => s === 'error')) {
      setStatus('error');
      return;
    }
    if (states.some((s) => s === 'connecting')) {
      setStatus('connecting');
      return;
    }
    setStatus('connected');
  }, []);

  const recordStatus = React.useCallback(
    (key: string, raw: RealtimeChannelStatus) => {
      const next: RealtimeStatus =
        raw === 'SUBSCRIBED'
          ? 'connected'
          : raw === 'CHANNEL_ERROR' || raw === 'TIMED_OUT' || raw === 'CLOSED'
            ? 'error'
            : 'connecting';
      channelStates.current.set(key, next);
      recomputeStatus();
    },
    [recomputeStatus]
  );

  const notifyGroup = React.useCallback(
    (slug: string, postId: string) => {
      // Revalidate server-side data so server components and cached fetches refresh.
      router.refresh();
      const listeners = groupListeners.current.get(slug);
      if (!listeners) return;
      listeners.forEach((listener) => {
        try {
          listener(postId);
        } catch {
          // ignore listener errors
        }
      });
    },
    [router]
  );

  const notifyPost = React.useCallback(
    (postId: string, commentId: string) => {
      router.refresh();
      const listeners = postListeners.current.get(postId);
      if (!listeners) return;
      listeners.forEach((listener) => {
        try {
          listener(commentId);
        } catch {
          // ignore listener errors
        }
      });
    },
    [router]
  );

  const notifyConversation = React.useCallback(
    (conversationId: string, messageId: string) => {
      router.refresh();
      const listeners = conversationListeners.current.get(conversationId);
      if (!listeners) return;
      listeners.forEach((listener) => {
        try {
          listener(messageId);
        } catch {
          // ignore listener errors
        }
      });
    },
    [router]
  );

  const subscribeGroup = React.useCallback(
    (slug: string, listener: PostListener) => {
      let listeners = groupListeners.current.get(slug);
      let cancelled = false;

      if (!listeners) {
        listeners = new Set();
        groupListeners.current.set(slug, listeners);
        channelStates.current.set(slug, 'connecting');
        recomputeStatus();

        subscribeToGroupPosts(
          slug,
          {
            onInsert: ({ id }) => {
              if (cancelled) return;
              notifyGroup(slug, id);
            },
            onStatus: (s) => recordStatus(slug, s),
          },
          { client }
        ).then((unsub) => {
          if (cancelled) {
            unsub();
            return;
          }
          groupUnsubs.current.set(slug, unsub);
        });
      }

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          cancelled = true;
          groupUnsubs.current.get(slug)?.();
          groupUnsubs.current.delete(slug);
          groupListeners.current.delete(slug);
          channelStates.current.delete(slug);
          recomputeStatus();
        }
      };
    },
    [client, notifyGroup, recomputeStatus, recordStatus]
  );

  const subscribePost = React.useCallback(
    (postId: string, listener: CommentListener) => {
      let listeners = postListeners.current.get(postId);
      if (!listeners) {
        listeners = new Set();
        postListeners.current.set(postId, listeners);
        channelStates.current.set(postId, 'connecting');
        recomputeStatus();

        const unsub = subscribeToPostComments(
          postId,
          {
            onInsert: ({ id }) => {
              notifyPost(postId, id);
            },
            onStatus: (s) => recordStatus(postId, s),
          },
          { client }
        );
        postUnsubs.current.set(postId, unsub);
      }

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          postUnsubs.current.get(postId)?.();
          postUnsubs.current.delete(postId);
          postListeners.current.delete(postId);
          channelStates.current.delete(postId);
          recomputeStatus();
        }
      };
    },
    [client, notifyPost, recomputeStatus, recordStatus]
  );

  const subscribeConversation = React.useCallback(
    (conversationId: string, listener: MessageListener) => {
      let listeners = conversationListeners.current.get(conversationId);
      if (!listeners) {
        listeners = new Set();
        conversationListeners.current.set(conversationId, listeners);
        channelStates.current.set(conversationId, 'connecting');
        recomputeStatus();

        const unsub = subscribeToConversation(
          conversationId,
          {
            onInsert: ({ id }) => {
              notifyConversation(conversationId, id);
            },
            onStatus: (s) => recordStatus(conversationId, s),
          },
          { client }
        );
        conversationUnsubs.current.set(conversationId, unsub);
      }

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          conversationUnsubs.current.get(conversationId)?.();
          conversationUnsubs.current.delete(conversationId);
          conversationListeners.current.delete(conversationId);
          channelStates.current.delete(conversationId);
          recomputeStatus();
        }
      };
    },
    [client, notifyConversation, recomputeStatus, recordStatus]
  );

  const value = React.useMemo(
    () => ({ subscribeGroup, subscribePost, subscribeConversation }),
    [subscribeGroup, subscribePost, subscribeConversation]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <RealtimeStatusDot status={status} />
    </RealtimeContext.Provider>
  );
}

function RealtimeStatusDot({ status }: { status: RealtimeStatus }) {
  const { dot, label } = {
    connected: { dot: 'bg-success', label: 'Live updates connected' },
    connecting: { dot: 'bg-amber-500', label: 'Connecting live updates' },
    error: { dot: 'bg-error', label: 'Live updates disconnected' },
  }[status];

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-2.5 py-1.5 shadow-[var(--pm-shadow)]"
    >
      <span
        role="img"
        aria-label={label}
        className={`inline-flex h-2.5 w-2.5 rounded-full ${dot}${status === 'connecting' ? ' animate-pulse' : ''}`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}