import { z } from 'zod';

export const NotificationType = {
  COMMENT: 'comment',
  REACTION: 'reaction',
  SOLUTION: 'solution',
  INVITE: 'invite',
  FLAG: 'flag',
  FLAG_RESOLVED: 'flag_resolved',
  MENTION: 'mention',
  BADGE: 'badge',
  NEW_FOLLOWER: 'new_follower',
  NEW_MESSAGE: 'new_message',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const notificationTypeSchema = z.nativeEnum(
  NotificationType as Record<string, string>
) as z.ZodType<NotificationType>;

export const notificationPayloadSchema = z.object({
  postId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  actorSlug: z.string().optional(),
  actorUsername: z.string().optional(),
  groupSlug: z.string().optional(),
  postSlug: z.string().optional(),
  inviteCode: z.string().optional(),
  flagId: z.string().uuid().optional(),
  reason: z.string().optional(),
  badgeSlug: z.string().optional(),
  badgeName: z.string().optional(),
  // WS9 DMs: new_message notifications deep-link into the conversation thread.
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  messagePreview: z.string().max(160).optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  type: notificationTypeSchema,
  payload: notificationPayloadSchema,
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
