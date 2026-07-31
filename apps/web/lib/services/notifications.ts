import { eq, and, desc, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { Notification, NotificationsQuery, NotificationPayload, NotificationType } from '@pm-operator/api';
import { toISO } from './shared';

export async function listNotifications(
  db: DrizzleClient,
  userId: string,
  query: NotificationsQuery
): Promise<Notification[]> {
  const { limit, unreadOnly } = query;
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(schema.notifications.userId, userId),
      unreadOnly ? sql`${schema.notifications.readAt} is null` : undefined
    ),
    orderBy: [desc(schema.notifications.createdAt)],
    limit,
  });

  return rows.map((n) => ({
    id: n.id,
    userId: n.userId,
    actorId: n.actorId,
    type: n.type as NotificationType,
    payload: (n.payload ?? {}) as NotificationPayload,
    readAt: n.readAt ? toISO(n.readAt) : null,
    createdAt: toISO(n.createdAt),
  }));
}

export async function markRead(
  db: DrizzleClient,
  notificationId: string,
  userId: string
): Promise<Notification> {
  const [updated] = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.userId, userId)
      )
    )
    .returning();

  if (!updated) throw new Error('Notification not found');

  return {
    id: updated.id,
    userId: updated.userId,
    actorId: updated.actorId,
    type: updated.type as NotificationType,
    payload: (updated.payload ?? {}) as NotificationPayload,
    readAt: updated.readAt ? toISO(updated.readAt) : null,
    createdAt: toISO(updated.createdAt),
  };
}

export async function insertNotification(
  db: DrizzleClient,
  input: {
    userId: string;
    actorId: string | null;
    type: NotificationType;
    payload: NotificationPayload;
  }
): Promise<Notification> {
  const [notification] = await db
    .insert(schema.notifications)
    .values({
      userId: input.userId,
      actorId: input.actorId,
      type: input.type,
      payload: input.payload,
    })
    .returning();

  if (!notification) throw new Error('Failed to create notification');

  return {
    id: notification.id,
    userId: notification.userId,
    actorId: notification.actorId,
    type: notification.type as NotificationType,
    payload: (notification.payload ?? {}) as NotificationPayload,
    readAt: notification.readAt ? toISO(notification.readAt) : null,
    createdAt: toISO(notification.createdAt),
  };
}
