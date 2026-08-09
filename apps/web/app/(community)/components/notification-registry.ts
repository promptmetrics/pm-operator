import {
  subscribeToUserNotifications,
  type RealtimeChannelStatus,
  type RealtimeClient,
} from '@/lib/realtime';
import type { Notification } from '@pm-operator/api';

/**
 * De-duplicating registry for user-notification streams, owned by
 * RealtimeProvider.
 *
 * Same pattern as the provider's group / post / conversation blocks — one
 * channel per key, N listeners fanned out from it, torn down when the last
 * listener leaves. It lives in its own module rather than inline in the
 * provider for one reason: it is then plain functions over a Supabase client,
 * so e2e/realtime-notifications-dedupe.vitest.ts can prove the de-duplication
 * in a node environment with no DOM and no database.
 *
 * Listeners receive the raw Supabase `postgres_changes` row, unchanged, which
 * is exactly what NotificationBell and NotificationsPage received when they
 * each called subscribeToUserNotifications directly.
 */
export type NotificationListener = (notification: Notification) => void;

export interface NotificationRegistryHooks {
  /** First listener for a user — a channel is about to open. */
  onOpen?: (userId: string) => void;
  onStatus?: (userId: string, status: RealtimeChannelStatus) => void;
  /** Last listener left — the channel has been closed. */
  onClose?: (userId: string) => void;
}

export interface NotificationRegistry {
  subscribe: (userId: string, listener: NotificationListener) => () => void;
  /** Open Supabase channels, i.e. users with at least one listener. */
  openChannelCount: () => number;
}

export function createNotificationRegistry(
  client: RealtimeClient,
  hooks: NotificationRegistryHooks = {}
): NotificationRegistry {
  const listeners = new Map<string, Set<NotificationListener>>();
  const unsubs = new Map<string, () => void>();

  function subscribe(userId: string, listener: NotificationListener): () => void {
    let current = listeners.get(userId);

    if (!current) {
      current = new Set<NotificationListener>();
      listeners.set(userId, current);
      hooks.onOpen?.(userId);

      const unsub = subscribeToUserNotifications<Notification>(
        userId,
        {
          onInsert: (notification) => {
            // Re-read from the map instead of closing over the Set: the entry
            // is replaced when a stream is torn down and re-opened.
            const active = listeners.get(userId);
            if (!active) return;
            active.forEach((fn) => {
              try {
                fn(notification);
              } catch {
                // One consumer throwing must not starve the other. The
                // /notifications incident began as an uncaught listener-side
                // throw taking the whole route down.
              }
            });
          },
          onStatus: (status) => hooks.onStatus?.(userId, status),
        },
        { client }
      );

      unsubs.set(userId, unsub);
    }

    current.add(listener);

    return () => {
      const active = listeners.get(userId);
      if (!active) return;
      active.delete(listener);
      if (active.size > 0) return;

      unsubs.get(userId)?.();
      unsubs.delete(userId);
      listeners.delete(userId);
      hooks.onClose?.(userId);
    };
  }

  return { subscribe, openChannelCount: () => unsubs.size };
}
