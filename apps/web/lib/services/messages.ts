import { eq, ne, and, or, desc, count, inArray, isNull, gt, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Conversation,
  Message,
  ConversationListQuery,
  ListMessagesQuery,
  CreateConversationRequest,
  SendMessageRequest,
  MessageAuthor,
  NotificationPayload,
} from '@pm-operator/api';
import { NotificationType } from '@pm-operator/api';
import { htmlToText } from '../html-to-text';
import { getAvatarReadUrl } from '../storage';
import { toISO } from './shared';
import { insertNotification } from './notifications';
import { autoFlagIfWatched } from './flags';

const PREVIEW_LEN = 140;

type UserLite = Pick<
  typeof schema.users.$inferSelect,
  'id' | 'username' | 'userslug' | 'fullName' | 'pictureUrl'
>;

// Map a user row to the lightweight author/partner chip. Avatar URL resolution
// is a Supabase Storage signed-URL call, not a DB query — same pattern as
// toPublicUserProfile, so it does not count against the pool budget.
async function toMessageAuthor(row: UserLite): Promise<MessageAuthor> {
  return {
    id: row.id,
    username: row.username,
    userslug: row.userslug,
    fullName: row.fullName,
    pictureUrl: await getAvatarReadUrl(row.pictureUrl),
  };
}

// Participation check (single query). Returns the participant row (with
// lastReadAt) or null when the user is not in the conversation / it doesn't
// exist. Routes translate null → 404 (existence not revealed to non-participants).
async function getParticipant(
  db: DrizzleClient,
  conversationId: string,
  userId: string
) {
  return db.query.conversationParticipants.findFirst({
    where: and(
      eq(schema.conversationParticipants.conversationId, conversationId),
      eq(schema.conversationParticipants.userId, userId)
    ),
  });
}

// Create a 1:1 conversation, idempotent by the participant pair (decision
// D9.2). Rejects self-conversations. Reuses an existing conversation if one
// already has exactly these two participants.
//
// The idempotency check is a select-then-insert, so two concurrent requests
// for the same pair (double-click, or A→B and B→A simultaneously) would both
// see no shared conversation and each insert a duplicate thread (TOCTOU). To
// prevent that, the whole check+insert runs in a transaction that locks both
// user rows (ordered by id to avoid deadlock) with SELECT FOR UPDATE — any
// concurrent createConversation involving either user serializes behind it.
export async function createConversation(
  db: DrizzleClient,
  userId: string,
  target: CreateConversationRequest
): Promise<{ id: string }> {
  if (target.targetUserId === userId) {
    throw new Error('Cannot start a conversation with yourself');
  }

  return db.transaction(async (tx) => {
    // Lock both user rows in a stable order so concurrent calls for the same
    // pair serialize. Single statement, not a multi-CTE exec.
    await tx.execute(sql`
      SELECT id FROM users WHERE id IN (${userId}, ${target.targetUserId})
      ORDER BY id FOR UPDATE
    `);

    // Idempotency: find a conversation where both userId and target are
    // participants. Two bounded queries (my memberships, then the target's
    // overlap) — no fan-out.
    const mine = await tx
      .select({ conversationId: schema.conversationParticipants.conversationId })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.userId, userId));
    if (mine.length > 0) {
      const shared = await tx
        .select({
          conversationId: schema.conversationParticipants.conversationId,
        })
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.userId, target.targetUserId),
            inArray(
              schema.conversationParticipants.conversationId,
              mine.map((m) => m.conversationId)
            )
          )
        )
        .limit(1);
      if (shared.length > 0) return { id: shared[0].conversationId };
    }

    const [conversation] = await tx
      .insert(schema.conversations)
      .values({})
      .returning({ id: schema.conversations.id });
    if (!conversation) throw new Error('Failed to create conversation');

    await tx.insert(schema.conversationParticipants).values([
      { conversationId: conversation.id, userId },
      { conversationId: conversation.id, userId: target.targetUserId },
    ]);

    return { id: conversation.id };
  });
}

// Single conversation for the inbox/thread header. Returns null if the caller
// is not a participant. Bounded waves: (1) participation + lastReadAt; (2)
// other participant + last message + unread count (3 concurrent); (3) partner
// user row.
export async function getConversation(
  db: DrizzleClient,
  conversationId: string,
  userId: string
): Promise<Conversation | null> {
  const me = await getParticipant(db, conversationId, userId);
  if (!me) return null;

  const [otherCp, lastMessages, unreadRows] = await Promise.all([
    db.query.conversationParticipants.findFirst({
      where: and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        ne(schema.conversationParticipants.userId, userId)
      ),
    }),
    db
      .selectDistinctOn([schema.messages.conversationId])
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(
        schema.messages.conversationId,
        desc(schema.messages.createdAt),
        desc(schema.messages.id)
      )
      .limit(1),
    db
      .select({ conversationId: schema.messages.conversationId, value: count() })
      .from(schema.messages)
      .innerJoin(
        schema.conversationParticipants,
        and(
          eq(
            schema.conversationParticipants.conversationId,
            schema.messages.conversationId
          ),
          eq(schema.conversationParticipants.userId, userId)
        )
      )
      .where(
        and(
          eq(schema.messages.conversationId, conversationId),
          or(
            isNull(schema.conversationParticipants.lastReadAt),
            gt(schema.messages.createdAt, schema.conversationParticipants.lastReadAt)
          )
        )
      )
      .groupBy(schema.messages.conversationId),
  ]);

  const partner =
    otherCp ?
      ((await db.query.users.findFirst({
        where: eq(schema.users.id, otherCp.userId),
        columns: {
          id: true,
          username: true,
          userslug: true,
          fullName: true,
          pictureUrl: true,
        },
      })) as UserLite | undefined)
    : undefined;
  const last = lastMessages[0];
  const unread = unreadRows[0];

  return {
    id: conversationId,
    partner: partner ? await toMessageAuthor(partner) : null,
    lastMessageAt: last ? toISO(last.createdAt) : null,
    lastMessagePreview: last ? truncate(last.contentPlain) : null,
    unreadCount: unread ? Number(unread.value) : 0,
  };
}

// Inbox list, sorted by last activity (conversations.updated_at, trigger-bumped).
// Bounded waves: (1) my memberships joined to conversations, paginated; (2)
// other participants + last message per conversation + unread counts (3
// concurrent, all inArray — no per-conversation fan-out); (3) partner user
// rows. Avatar URL resolution is a Storage call, not a DB query.
export async function listConversations(
  db: DrizzleClient,
  userId: string,
  query: ConversationListQuery
): Promise<{ items: Conversation[]; hasMore: boolean }> {
  const limit = query.limit;
  const offset = (query.page - 1) * limit;

  // Wave 1: my conversations, newest activity first.
  const rows = await db
    .select({
      conversationId: schema.conversationParticipants.conversationId,
      lastReadAt: schema.conversationParticipants.lastReadAt,
    })
    .from(schema.conversationParticipants)
    .innerJoin(
      schema.conversations,
      eq(schema.conversations.id, schema.conversationParticipants.conversationId)
    )
    .where(eq(schema.conversationParticipants.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const convIds = page.map((r) => r.conversationId);
  if (convIds.length === 0) return { items: [], hasMore };

  // Wave 2: other participants, last message per conversation, unread counts.
  const [otherCps, lastMessages, unreadRows] = await Promise.all([
    db
      .select({
        conversationId: schema.conversationParticipants.conversationId,
        userId: schema.conversationParticipants.userId,
      })
      .from(schema.conversationParticipants)
      .where(
        and(
          inArray(schema.conversationParticipants.conversationId, convIds),
          ne(schema.conversationParticipants.userId, userId)
        )
      ),
    db
      .selectDistinctOn([schema.messages.conversationId])
      .from(schema.messages)
      .where(inArray(schema.messages.conversationId, convIds))
      .orderBy(
        schema.messages.conversationId,
        desc(schema.messages.createdAt),
        desc(schema.messages.id)
      ),
    db
      .select({
        conversationId: schema.messages.conversationId,
        value: count(),
      })
      .from(schema.messages)
      .innerJoin(
        schema.conversationParticipants,
        and(
          eq(
            schema.conversationParticipants.conversationId,
            schema.messages.conversationId
          ),
          eq(schema.conversationParticipants.userId, userId)
        )
      )
      .where(
        and(
          inArray(schema.messages.conversationId, convIds),
          or(
            isNull(schema.conversationParticipants.lastReadAt),
            gt(schema.messages.createdAt, schema.conversationParticipants.lastReadAt)
          )
        )
      )
      .groupBy(schema.messages.conversationId),
  ]);

  const partnerByConv = new Map(
    otherCps.map((r) => [r.conversationId, r.userId] as const)
  );
  const lastByConv = new Map(lastMessages.map((m) => [m.conversationId, m] as const));
  const unreadByConv = new Map(
    unreadRows.map((r) => [r.conversationId, Number(r.value)] as const)
  );

  // Wave 3: partner user rows (one inArray query).
  const partnerIds = [...new Set(partnerByConv.values())];
  const partnerRows =
    partnerIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(schema.users.id, partnerIds),
          columns: {
            id: true,
            username: true,
            userslug: true,
            fullName: true,
            pictureUrl: true,
          },
        })
      : [];

  const authorsByUserId = new Map<string, MessageAuthor>();
  await Promise.all(
    partnerRows.map(async (u) => {
      authorsByUserId.set(u.id, await toMessageAuthor(u));
    })
  );

  const items = page.map((r) => {
    const partnerId = partnerByConv.get(r.conversationId);
    const partner = partnerId ? authorsByUserId.get(partnerId) ?? null : null;
    const last = lastByConv.get(r.conversationId);
    return {
      id: r.conversationId,
      partner,
      lastMessageAt: last ? toISO(last.createdAt) : null,
      lastMessagePreview: last ? truncate(last.contentPlain) : null,
      unreadCount: unreadByConv.get(r.conversationId) ?? 0,
    } satisfies Conversation;
  });

  return { items, hasMore };
}

// Thread messages, oldest-first (natural reading order), paginated. Returns
// null if the caller is not a participant. Bounded: (1) participation; (2)
// messages page (limit+1); (3) author user rows (inArray).
export async function listMessages(
  db: DrizzleClient,
  conversationId: string,
  userId: string,
  query: ListMessagesQuery
): Promise<{ items: Message[]; hasMore: boolean } | null> {
  const me = await getParticipant(db, conversationId, userId);
  if (!me) return null;

  const limit = query.limit;
  const offset = (query.page - 1) * limit;

  const rows = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: [desc(schema.messages.createdAt), desc(schema.messages.id)],
    limit: limit + 1,
    offset,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // oldest-first in the page

  const authorIds = [
    ...new Set(page.map((m) => m.authorId).filter((id): id is string => id !== null)),
  ];
  const authorRows =
    authorIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(schema.users.id, authorIds),
          columns: {
            id: true,
            username: true,
            userslug: true,
            fullName: true,
            pictureUrl: true,
          },
        })
      : [];

  const authorsByUserId = new Map<string, MessageAuthor>();
  await Promise.all(
    authorRows.map(async (u) => {
      authorsByUserId.set(u.id, await toMessageAuthor(u));
    })
  );

  const items = page.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    author: m.authorId ? authorsByUserId.get(m.authorId) ?? null : null,
    body: m.body,
    createdAt: toISO(m.createdAt),
  }));

  return { items, hasMore };
}

// Send a message. Verifies participation, sanitizes to contentPlain, auto-flags
// watched phrases inside the insert transaction (D9.6), and notifies the other
// participant (D9.8 — one new_message per message). Returns null if the caller
// is not a participant.
export async function sendMessage(
  db: DrizzleClient,
  conversationId: string,
  authorId: string,
  input: SendMessageRequest
): Promise<Message | null> {
  const me = await getParticipant(db, conversationId, authorId);
  if (!me) return null;

  const contentPlain = htmlToText(input.body);

  const message = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.messages)
      .values({
        conversationId,
        authorId,
        body: input.body,
        contentPlain,
      })
      .returning();
    if (!created) throw new Error('Failed to send message');

    await autoFlagIfWatched(tx, created.contentPlain, 'message', created.id);
    return created;
  });

  // Notify the other participant (and resolve the author for the response) in
  // a 2-wide wave — both are single queries.
  const [author, otherCp] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, authorId),
      columns: {
        id: true,
        username: true,
        userslug: true,
        fullName: true,
        pictureUrl: true,
      },
    }),
    db.query.conversationParticipants.findFirst({
      where: and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        ne(schema.conversationParticipants.userId, authorId)
      ),
    }),
  ]);

  if (otherCp) {
    const payload: NotificationPayload = {
      actorId: authorId,
      actorSlug: author?.userslug,
      actorUsername: author?.username,
      conversationId,
      messageId: message.id,
      messagePreview: truncate(contentPlain),
    };
    await insertNotification(db, {
      userId: otherCp.userId,
      actorId: authorId,
      type: NotificationType.NEW_MESSAGE,
      payload,
    });
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    author: author ? await toMessageAuthor(author as UserLite) : null,
    body: message.body,
    createdAt: toISO(message.createdAt),
  };
}

// Mark the conversation read (bump lastReadAt to now), clearing the unread
// badge. Returns false if the caller is not a participant.
export async function markRead(
  db: DrizzleClient,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const me = await getParticipant(db, conversationId, userId);
  if (!me) return false;

  await db
    .update(schema.conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        eq(schema.conversationParticipants.userId, userId)
      )
    );
  return true;
}

function truncate(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > PREVIEW_LEN ? `${single.slice(0, PREVIEW_LEN)}…` : single;
}