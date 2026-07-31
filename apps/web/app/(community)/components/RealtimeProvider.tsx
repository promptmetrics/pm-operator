'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  createRealtimeClient,
  subscribeToGroupPosts,
  subscribeToPostComments,
} from '@/lib/realtime';

type PostListener = (postId: string) => void;
type CommentListener = (commentId: string) => void;

interface RealtimeContextValue {
  subscribeGroup: (slug: string, listener: PostListener) => () => void;
  subscribePost: (postId: string, listener: CommentListener) => () => void;
}

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

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const client = React.useMemo(() => createRealtimeClient(), []);

  const groupListeners = React.useRef(new Map<string, Set<PostListener>>());
  const groupUnsubs = React.useRef(new Map<string, () => void>());
  const postListeners = React.useRef(new Map<string, Set<CommentListener>>());
  const postUnsubs = React.useRef(new Map<string, () => void>());

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

  const subscribeGroup = React.useCallback(
    (slug: string, listener: PostListener) => {
      let listeners = groupListeners.current.get(slug);
      let cancelled = false;

      if (!listeners) {
        listeners = new Set();
        groupListeners.current.set(slug, listeners);

        subscribeToGroupPosts(
          slug,
          {
            onInsert: ({ id }) => {
              if (cancelled) return;
              notifyGroup(slug, id);
            },
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
        }
      };
    },
    [client, notifyGroup]
  );

  const subscribePost = React.useCallback(
    (postId: string, listener: CommentListener) => {
      let listeners = postListeners.current.get(postId);
      if (!listeners) {
        listeners = new Set();
        postListeners.current.set(postId, listeners);

        const unsub = subscribeToPostComments(
          postId,
          {
            onInsert: ({ id }) => {
              notifyPost(postId, id);
            },
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
        }
      };
    },
    [client, notifyPost]
  );

  const value = React.useMemo(
    () => ({ subscribeGroup, subscribePost }),
    [subscribeGroup, subscribePost]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        Live updates enabled
      </div>
    </RealtimeContext.Provider>
  );
}
