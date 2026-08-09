import { test, expect } from 'vitest';

import { createNotificationRegistry } from '../app/(community)/components/notification-registry';
import type { RealtimeClient } from '../lib/realtime';
import type { Notification } from '@pm-operator/api';

/**
 * The structural half of the /notifications fix. lib/realtime.ts's
 * uniqueTopic() stops two subscribers from colliding on one supabase-js
 * channel (see realtime-fallback.vitest.ts, which asserts two channels there
 * on purpose). This asserts the layer above it: routed through
 * RealtimeProvider, the header NotificationBell and the notifications page
 * open ONE channel between them, not two.
 *
 * DB-free — everything runs against an in-memory double of the two supabase-js
 * behaviours that matter.
 */
interface FakeChannel {
  topic: string;
  joined: boolean;
  handlers: Array<(payload: { new: Record<string, unknown> }) => void>;
  on: (...args: unknown[]) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
}

function fakeSupabaseClient() {
  const channels = new Map<string, FakeChannel>();

  const client = {
    channel(topic: string): FakeChannel {
      const existing = channels.get(topic);
      if (existing) return existing;
      const channel: FakeChannel = {
        topic,
        joined: false,
        handlers: [],
        on(...args: unknown[]) {
          if (channel.joined) {
            throw new Error(
              `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`
            );
          }
          const handler = args[2] as (payload: { new: Record<string, unknown> }) => void;
          if (typeof handler === 'function') channel.handlers.push(handler);
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

function emit(channels: Map<string, FakeChannel>, row: Record<string, unknown>) {
  channels.forEach((channel) => {
    channel.handlers.forEach((handler) => handler({ new: row }));
  });
}

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

test('two subscribers for one user share a single channel', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  const bellSeen: string[] = [];
  const pageSeen: string[] = [];

  const unsubBell = registry.subscribe(USER_A, (n) => bellSeen.push(n.id));
  const unsubPage = registry.subscribe(USER_A, (n) => pageSeen.push(n.id));

  // The whole point: the page mounting on top of the header bell must not open
  // a second stream for the same user.
  expect(channels.size).toBe(1);
  expect(registry.openChannelCount()).toBe(1);

  // Both still get the row — the bell keeps counting, the page keeps prepending.
  emit(channels, { id: 'n1' });
  expect(bellSeen).toEqual(['n1']);
  expect(pageSeen).toEqual(['n1']);

  unsubBell();
  unsubPage();
});

test('the channel closes only when the last listener leaves', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  const bellSeen: string[] = [];
  const unsubBell = registry.subscribe(USER_A, (n) => bellSeen.push(n.id));
  const unsubPage = registry.subscribe(USER_A, () => {});

  // Navigating away from /notifications must not kill the header bell's feed.
  unsubPage();
  expect(channels.size).toBe(1);

  emit(channels, { id: 'n2' });
  expect(bellSeen).toEqual(['n2']);

  unsubBell();
  expect(channels.size).toBe(0);
  expect(registry.openChannelCount()).toBe(0);
});

test('unsubscribing twice does not tear down a later subscription', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  const unsub = registry.subscribe(USER_A, () => {});
  unsub();
  unsub();
  expect(channels.size).toBe(0);

  const seen: string[] = [];
  registry.subscribe(USER_A, (n) => seen.push(n.id));
  expect(channels.size).toBe(1);

  emit(channels, { id: 'n3' });
  expect(seen).toEqual(['n3']);
});

test('different users get their own channels', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  registry.subscribe(USER_A, () => {});
  registry.subscribe(USER_B, () => {});

  expect(registry.openChannelCount()).toBe(2);
  expect(channels.size).toBe(2);
});

test('a throwing listener does not starve the other subscriber', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  const survivorSeen: string[] = [];
  registry.subscribe(USER_A, () => {
    throw new Error('listener blew up');
  });
  registry.subscribe(USER_A, (n) => survivorSeen.push(n.id));

  expect(() => emit(channels, { id: 'n4' })).not.toThrow();
  expect(survivorSeen).toEqual(['n4']);
});

test('channel status is reported once per user, not once per subscriber', () => {
  const { client } = fakeSupabaseClient();
  const opened: string[] = [];
  const statuses: Array<[string, string]> = [];
  const closed: string[] = [];

  const registry = createNotificationRegistry(client, {
    onOpen: (userId) => opened.push(userId),
    onStatus: (userId, status) => statuses.push([userId, status]),
    onClose: (userId) => closed.push(userId),
  });

  const unsubBell = registry.subscribe(USER_A, () => {});
  const unsubPage = registry.subscribe(USER_A, () => {});

  expect(opened).toEqual([USER_A]);
  expect(statuses).toEqual([[USER_A, 'SUBSCRIBED']]);
  expect(closed).toEqual([]);

  unsubBell();
  expect(closed).toEqual([]);
  unsubPage();
  expect(closed).toEqual([USER_A]);
});

test('listeners receive the realtime row unchanged', () => {
  const { client, channels } = fakeSupabaseClient();
  const registry = createNotificationRegistry(client);

  const received: Notification[] = [];
  registry.subscribe(USER_A, (n) => received.push(n));

  const row = { id: 'n5', type: 'mention', user_id: USER_A };
  emit(channels, row);

  // NotificationsPage prepends whatever arrives, so the payload must pass
  // through the registry untouched.
  expect(received).toHaveLength(1);
  expect(received[0] as unknown as Record<string, unknown>).toEqual(row);
});
