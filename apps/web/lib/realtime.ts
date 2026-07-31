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

export interface RealtimeInsertCallbacks<T extends IdRow> {
  onInsert?: (row: T) => void;
}

function missingEnvRealtimeClient(): RealtimeClient {
  return new Proxy({} as RealtimeClient, {
    get(_target, prop) {
      if (prop === 'channel') {
        return () =>
          new Proxy(
            {},
            {
              get(_ch, chProp) {
                if (chProp === 'on') return () => missingEnvRealtimeClient();
                if (chProp === 'subscribe') return () => {};
                return () => missingEnvRealtimeClient();
              },
            }
          );
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
    .channel(`group:${groupId}:posts`)
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
    .channel(`post:${postId}:comments`)
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
    .channel(`user:${userId}:notifications`)
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
      if (status === 'CHANNEL_ERROR') {
        removeChannel(client, channel);
      }
    });

  return () => removeChannel(client, channel);
}
