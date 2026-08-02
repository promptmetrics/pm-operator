import { z } from 'zod';
import { pageQuerySchema } from './common';

// Lightweight author/partner chip — a subset of publicUserProfileSchema. DMs
// don't need reputation/level/streak to render, so this avoids the
// acceptedSolutions fan-out that toPublicUserProfile would trigger.
export const messageAuthorSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  userslug: z.string(),
  fullName: z.string().nullable(),
  pictureUrl: z.string().url().nullable(),
});

export type MessageAuthor = z.infer<typeof messageAuthorSchema>;

// Inbox row. `partner` is the *other* participant (null when the counterparty
// was erased). `unreadCount` derives from lastReadAt < messages after it.
export const conversationSchema = z.object({
  id: z.string().uuid(),
  partner: messageAuthorSchema.nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const conversationListQuerySchema = pageQuerySchema;

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const createConversationRequestSchema = z.object({
  targetUserId: z.string().uuid(),
});

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  author: messageAuthorSchema.nullable(),
  body: z.string(),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof messageSchema>;

export const listMessagesQuerySchema = pageQuerySchema;

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const sendMessageRequestSchema = z.object({
  body: z.string().min(1).max(8000),
});

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;