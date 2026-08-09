'use client';

import { createBrowserClient } from '@supabase/ssr';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Group } from '@pm-operator/api';

export type RealtimeClient = SupabaseClient;

export type RealtimeInsertPayload<T extends Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;

// Supabase REALTIME_SUBSCRIBE_STATES, surfaced up to subscribers (T8.8) so the
// UI can reflect real channel state instead of always claiming "enabled".
export type RealtimeChannelStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export interface RealtimeInsertCallbacks<T extends IdRow> {
  onInsert?: (row: T) => void;
  onStatus?: (status: RealtimeChannelStatus) => void;
}

/**
 * Stand-in channel used when the Supabase env vars are absent. supabase-js
 * channel methods are chainable and return the channel, so this returns
 * *itself* for every method — `.on(...).subscribe(...)` then behaves the way it
 * does against a real client instead of throwing mid-chain.
 */
function missingEnvRealtimeChannel(): RealtimeChannel {
  const channel: RealtimeChannel = new Proxy({} as RealtimeChannel, {
    get(_target, prop) {
      // Never look thenable: an accidental `await channel` would otherwise call
      // this trap for `then` and hang.
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return () => channel;
    },
  });
  return channel;
}

function missingEnvRealtimeClient(): RealtimeClient {
  return new Proxy({} as RealtimeClient, {
    get(_target, prop) {
      if (prop === 'channel') {
        return () => missingEnvRealtimeChannel();
      }
      if (prop === 'removeChannel') {
        return async () => {};
      }
      throw new Error(
        `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables (tried RealtimeClient.${String(prop)})`
      );
    },
  });
}

export function createRealtimeClient(): RealtimeClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return missingEnvRealtimeClient();
  }
  return createBrowserClient(url, anonKey);
}

export class Deduper {
  private seen = new Set<string>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Returns true if the id was already seen. Adds new ids to the set.
   */
  has(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    if (this.seen.size > this.maxSize) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
    }
    return false;
  }
}

export interface SubscribeOptions {
  client?: RealtimeClient;
  deduper?: Deduper;
}

function getClient(opts?: SubscribeOptions): RealtimeClient {
  return opts?.client ?? createRealtimeClient();
}

function getDeduper(opts?: SubscribeOptions): Deduper {
  return opts?.deduper ?? new Deduper();
}

function removeChannel(client: RealtimeClient, channel: RealtimeChannel) {
  client.removeChannel(channel).catch(() => {});
}

let channelSeq = 0;

/**
 * Give every subscription its own channel topic.
 *
 * `createBrowserClient` is a singleton in the browser, and supabase-js's
 * `client.channel(topic)` hands back the EXISTING channel when one with that
 * topic is already registered. `RealtimeChannel.on()` throws once its channel
 * is joining or joined ("cannot add `postgres_changes` callbacks ... after
 * `subscribe()`"), so a second component subscribing to the same subject used
 * to crash — which is exactly what the header NotificationBell and the
 * /notifications page did to each other on `user:<id>:notifications`. The
 * throw happens inside an effect, so it took the whole route down to the
 * global error boundary.
 *
 * A per-call suffix keeps the channels separate, and it also means each
 * subscriber's cleanup removes only the channel it opened.
 */
function uniqueTopic(topic: string): string {
  channelSeq += 1;
  return `${topic}:s${channelSeq}`;
}

/**
 * Resolve a circle slug to its group_id UUID using the same API route that
 * delegates to the getGroupBySlug service.
 */
export async function resolveGroupId(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/v1/groups/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Group };
    return json.data?.id ?? null;
  } catch {
    return null;
  }
}

export interface IdRow {
  id: string;
}

/**
 * Subscribe to new posts in a circle. The slug is resolved to a group_id before
 * subscribing because Realtime filters operate on raw column values.
 */
export async function subscribeToGroupPosts<T extends IdRow>(
  slug: string,
  callbacks: RealtimeInsertCallbacks<T>,
  opts?: SubscribeOptions
): Promise<() => void> {
  const groupId = await resolveGroupId(slug);
  if (!groupId) return () => {};

  const client = getClient(opts);
  const deduper = getDeduper(opts);

  const channel = client
    .channel(uniqueTopic(`group:${groupId}:posts`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: `group_id=eq.${groupId}`,
      },
      (payload: RealtimeInsertPayload<{ id?: string }>) => {
        const id = (payload.new as { id?: string }).id;
        if (!id || deduper.has(id)) return;
        callbacks.onInsert?.(payload.new as T);
      }
    )
    .subscribe((status) => {
      callbacks.onStatus?.(status as RealtimeChannelStatus);
      if (status === 'CHANNEL_ERROR') {
        removeChannel(client, channel);
      }
    });

  return () => removeChannel(client, channel);
}

/**
 * Subscribe to new comments on a post.
 */
export function subscribeToPostComments<T extends IdRow>(
  postId: string,
  callbacks: RealtimeInsertCallbacks<T>,
  opts?: SubscribeOptions
): () => void {
  const client = getClient(opts);
  const deduper = getDeduper(opts);

  const channel = client
    .channel(uniqueTopic(`post:${postId}:comments`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`,
      },
      (payload: RealtimeInsertPayload<{ id?: string }>) => {
        const id = (payload.new as { id?: string }).id;
        if (!id || deduper.has(id)) return;
        callbacks.onInsert?.(payload.new as T);
      }
    )
    .subscribe((status) => {
      callbacks.onStatus?.(status as RealtimeChannelStatus);
      if (status === 'CHANNEL_ERROR') {
        removeChannel(client, channel);
      }
    });

  return () => removeChannel(client, channel);
}

/**
 * Subscribe to new messages in a conversation (WS9 DMs). Mirrors
 * subscribeToPostComments — Realtime filters on the raw conversation_id column.
 * `messages` was added to the supabase_realtime publication in migration 0017.
 */
export function subscribeToConversation<T extends IdRow>(
  conversationId: string,
  callbacks: RealtimeInsertCallbacks<T>,
  opts?: SubscribeOptions
): () => void {
  const client = getClient(opts);
  const deduper = getDeduper(opts);

  const channel = client
    .channel(uniqueTopic(`conversation:${conversationId}:messages`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: RealtimeInsertPayload<{ id?: string }>) => {
        const id = (payload.new as { id?: string }).id;
        if (!id || deduper.has(id)) return;
        callbacks.onInsert?.(payload.new as T);
      }
    )
    .subscribe((status) => {
      callbacks.onStatus?.(status as RealtimeChannelStatus);
      if (status === 'CHANNEL_ERROR') {
        removeChannel(client, channel);
      }
    });

  return () => removeChannel(client, channel);
}

/**
 * Subscribe to new notifications for a user.
 */
export function subscribeToUserNotifications<T extends IdRow>(
  userId: string,
  callbacks: RealtimeInsertCallbacks<T>,
  opts?: SubscribeOptions
): () => void {
  const client = getClient(opts);
  const deduper = getDeduper(opts);

  const channel = client
    .channel(uniqueTopic(`user:${userId}:notifications`))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimeInsertPayload<{ id?: string }>) => {
        const id = (payload.new as { id?: string }).id;
        if (!id || deduper.has(id)) return;
        callbacks.onInsert?.(payload.new as T);
      }
    )
    .subscribe((status) => {
      callbacks.onStatus?.(status as RealtimeChannelStatus);
      if (status === 'CHANNEL_ERROR') {
        removeChannel(client, channel);
      }
    });

  return () => removeChannel(client, channel);
}
