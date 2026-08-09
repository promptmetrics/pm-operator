import { test, expect } from 'vitest';

import {
  createRealtimeClient,
  subscribeToUserNotifications,
  type RealtimeClient,
} from '../lib/realtime';

// Regression cover for the /notifications crash (CI run 31296358385): every
// test that visited the page hit the global error boundary, data or not,
// because the header NotificationBell and NotificationsPage both subscribed to
// `user:<id>:notifications` on the same singleton browser client. supabase-js
// returns the EXISTING channel for a topic it already knows, and
// RealtimeChannel.on() throws once that channel is joining or joined — inside
// a React effect, which takes the whole route down.
//
// DB-free: both cases run against stubs, no Supabase project involved.

interface FakeChannel {
  topic: string;
  joined: boolean;
  on: (...args: unknown[]) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
}

/**
 * Mimics the two supabase-js behaviours that combined into the crash:
 * `channel(topic)` de-duplicates by topic, and `on('postgres_changes', …)`
 * throws after `subscribe()`.
 */
function fakeSupabaseClient() {
  const channels = new Map<string, FakeChannel>();

  const client = {
    channel(topic: string): FakeChannel {
      const existing = channels.get(topic);
      if (existing) return existing;
      const channel: FakeChannel = {
        topic,
        joined: false,
        on(...args: unknown[]) {
          void args;
          if (channel.joined) {
            throw new Error(
              `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`
            );
          }
          return channel;
        },
        subscribe(cb?: (status: string) => void) {
          channel.joined = true;
          cb?.('SUBSCRIBED');
          return channel;
        },
      };
      channels.set(topic, channel);
      return channel;
    },
    async removeChannel(channel: FakeChannel) {
      channels.delete(channel.topic);
      return 'ok';
    },
  };

  return { client: client as unknown as RealtimeClient, channels };
}

test('two subscribers to the same user notifications stream do not collide', () => {
  const { client, channels } = fakeSupabaseClient();
  const userId = '00000000-0000-4000-8000-000000000001';

  // The header bell subscribes first on every community page.
  const unsubBell = subscribeToUserNotifications(userId, {}, { client });

  // …then the notifications page mounts. Before the fix this threw
  // "cannot add `postgres_changes` callbacks … after `subscribe()`".
  const unsubPage = subscribeToUserNotifications(userId, {}, { client });

  expect(channels.size).toBe(2);

  // Each subscriber owns the channel it opened, so one unmounting must not
  // tear down the other's stream.
  unsubPage();
  expect(channels.size).toBe(1);
  unsubBell();
});

test('the missing-env fallback survives a chained .on().subscribe()', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const client = createRealtimeClient();
    // The whole point of the fallback: no env, no crash.
    const unsub = subscribeToUserNotifications(
      '00000000-0000-4000-8000-000000000002',
      {},
      { client }
    );
    expect(typeof unsub).toBe('function');
    unsub();

    // Anything outside the channel/removeChannel surface still fails loudly.
    expect(() => (client as unknown as { from: unknown }).from).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  } finally {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  }
});
