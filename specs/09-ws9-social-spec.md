# WS9 social spec addendum — Follow graph + Direct Messages (T9.0)

> **Status: SPEC ONLY.** This addendum specifies the WS9 social domain (follow graph + DMs). It is a *spec* — no `schema.ts`, migration, contract, route, service, or UI code is written from it until **you approve**. On approval, the downstream edits are listed in §10 and executed as T9.1–T9.3.
>
> **What this overrules.** `specs/05-prd.md` §non-goals (≈line 490) deferred "Real-time chat / DMs" with the rationale "User feedback strongly requests async chat." The 2026-08-01 **D5** decision (`specs/SPEC_LOG.md` ≈line 183) explicitly overrules that deferral and mandates this addendum before any WS9 build. This addendum closes the open SPEC_LOG bullets "Follow + Message — spec addendum required" (line 183/191).

**Scope of WS9 (from `docs/DESIGN-GAP-REPORT.md` lines 43/57/224):** follow graph (T9.1), DMs (T9.2), notification + rate-limit + GDPR wiring (folded into T9.1/T9.2), and the follow/DM UI surfaces (T9.3). Today the repo has **zero** follows/conversations/messages tables, contracts, routes, or UI — grep across `packages/db` and `apps/web` returns only UI copy ("You're now following …", meaning circle membership) and unrelated hits. This is greenfield.

**Grounding.** Every convention below is derived from the live codebase (research notes inline): `packages/db/src/schema.ts` table/enum/`unique`/`.enableRLS()` patterns; `packages/db/migrations/0015_goofy_tarot.sql` migration style; `0001` counter-trigger pattern; `0002` `DO $$ … ALTER TYPE ADD VALUE` enum-extension pattern; `packages/api/src/contracts/notifications.ts`; `apps/web/lib/rate-limit.ts`; `apps/web/lib/realtime.ts` subscribe pattern; `apps/web/lib/services/flags.ts` `autoFlagIfWatched`; `docs/GDPR-ERASURE-RUNBOOK.md` 10-step shape; `specs/SPEC_LOG.md` append point.

---

## 1. Decisions (TL;DR — pick + justify)

| # | Decision | Rejected alternative | Why |
|---|----------|----------------------|-----|
| D9.1 | **Instant public follow** — `follows(follower_id, followee_id)` unique pair; follow takes effect immediately (skool/daily.dev style). No request/accept. | Request/accept `follow_status` enum (pending/accepted/blocked). | 10–50-user operator community values low-friction growth; no block/spam product in v1. Request/accept adds a state machine, a counter trigger variant, and a pending-inbox UI we don't need. Schema stays one row = one edge. Block-list is a later, separate feature. |
| D9.2 | **3-table DM model** — `conversations` + `conversation_participants` + `messages`, **capped to 2 participants at launch** (app-enforced), schema-ready for group DMs later. | Simpler two-party `messages(sender_id, recipient_id, body)` table. | (a) Realtime filters on a single `conversation_id` column (`conversation:{id}:messages`, filter `conversation_id=eq.{id}`) — a 2-party table has no stable single-column channel key, so we'd synthesize one or filter on a composite, which the existing `subscribeToPostComments` pattern doesn't support. (b) RLS "participant-only reads" is a clean `EXISTS (… conversation_participants …)` subquery; a 2-party table needs two column checks (`sender_id = auth.uid() OR recipient_id = auth.uid()`) and a more awkward "list my conversations" query. (c) The marginal cost is one join table + one join; group DMs later are a *capacity* change, not a *schema* rewrite. |
| D9.3 | **Counts as columns, trigger-maintained** — `users.follower_count` / `users.following_count` (integer, default 0, `NOT NULL`), kept in sync by an `AFTER INSERT OR DELETE` plpgsql trigger (the `member_count` pattern, `migrations/0001:78-94`). | Count at read-time via `SELECT count(*)`. | Profile pages already read count columns in their bounded waves; a read-time count adds a query per profile view and fans out under the pool rule. The trigger pattern is already established and tested in prod. |
| D9.4 | **`messages.author_id` uses `onDelete: 'set null'`** (NOT cascade). | `onDelete: 'cascade'`. | GDPR erasure must preserve the *counterparty's* thread continuity (see §8). Cascade would hard-delete the subject's sent messages from every conversation, destroying the other person's readable history. Set-null keeps the row (timestamps/ordering intact), and the erasure step blanks the body to a sentinel — anonymize-retain, matching the runbook's existing posts/comments approach. |
| D9.5 | **`/messages` lives inside the `(community)` route group** so the existing `RealtimeProvider` (`apps/web/app/(community)/layout.tsx`) covers it. | Lift `RealtimeProvider` to the root layout. | Scoping Realtime to the community surface is deliberate (keeps it off `/login`, `/admin`, marketing pages). DMs are a community feature; keeping them under `(community)` needs no provider move. |
| D9.6 | **DM content policy = insert-then-flag**, mirroring posts/comments: `autoFlagIfWatched(db, contentPlain, 'message', messageId)` inside the insert transaction. Add `'message'` to the flags target-type enum. | Client-side pre-warn before send. | Consistent with the existing content-policy model (watched phrases auto-flag, never auto-reject, human moderator reviews). DM bodies get a `contentPlain` via the existing `htmlToText` and the same flag path. |
| D9.7 | **`updated_at` is trigger-maintained only for `conversations`** (bumped on message insert); `follows` and `messages` are append-only (`created_at` only). | Add the codebase's first `moddatetime` auto-trigger for all `updated_at`. | The codebase has **no** auto-`updated_at` trigger anywhere (`grep` confirms) — apps set `updated_at = now()` themselves. Introducing one just for WS9 would be an inconsistency. `conversations.updated_at` genuinely needs to track "last activity" for inbox sort, so it gets a single-purpose message-insert trigger; the other two tables are immutable. |
| D9.8 | **No notification dedup** — one `new_follower` per follow event, one `new_message` per message. | Dedup (one row per follower, or batch messages). | Matches existing behavior (`insertNotification` has no dedup today). Dedup adds a unique constraint + upsert logic for a marginal inbox-noise win at 10–50 users. Batching can be revisited if volume grows. |

---

## 2. Follow graph

### 2.1 Table (Drizzle, matching `schema.ts` conventions)

```ts
// pgEnum section (none needed — no status enum)

export const follows = pgTable('follows', {
  followerId: uuid('follower_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  followeeId: uuid('followee_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Composite PK = the unique (follower, followee) pair — the row IS the edge.
  pk: primaryKey({ columns: [t.followerId, t.followeeId] }),
  followingIdx: index('follows_followee_idx').on(t.followeeId, t.createdAt), // list X's followers
  followersIdx: index('follows_follower_idx').on(t.followerId, t.createdAt), // list X's following
})).enableRLS();
```

- **Self-follow guard:** reject in the service (`followerId === followeeId` → 400). A DB `CHECK (follower_id <> followee_id)` is optional hardening; the codebase has no `CHECK` precedent, so app-level is the default with a noted DB option.
- **Count columns on `users`:** add `followerCount: integer('follower_count').default(0).notNull()` and `followingCount: integer('following_count').default(0).notNull()` (default-0 counter columns, matching `member_count`).

### 2.2 Counter trigger (the `member_count` pattern, `migrations/0001:78-94`)

```sql
CREATE OR REPLACE FUNCTION update_follow_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE users SET follower_count  = follower_count  + 1 WHERE id = NEW.followee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE users SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.followee_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follow_counts ON follows;
CREATE TRIGGER trg_follow_counts AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();
```

### 2.3 RLS policies (hand-SQL in migration 0016; `auth.uid()` style from `0002`/`0015`)

| Op | Policy | Rationale |
|----|--------|-----------|
| SELECT | `USING (follower_id = auth.uid() OR followee_id = auth.uid())` | You can see your own followers and who you follow. **Public follower lists (seeing who follows someone else) are deferred** — the *counts* are public (read from `users.follower_count`), but the edge list is self-only (privacy-leaning default; revisit if a public-followers feature is requested). |
| INSERT | `WITH CHECK (follower_id = auth.uid())` | You can only create edges where you're the follower. |
| DELETE | `USING (follower_id = auth.uid())` | You can only unfollow edges you created. |
| UPDATE | none (immutable) | Follows are create/delete only. |

### 2.4 Routes + rate limit + notification

- **Routes** (all `runtime = 'nodejs'`, helpers from `apps/web/lib/api/server.ts`):
  - `POST /api/v1/users/[slug]/follow` → create edge (service: upsert; idempotent — re-following is a no-op, not an error). Inserts a `new_follower` notification for the followee.
  - `DELETE /api/v1/users/[slug]/follow` → unfollow (idempotent).
  - `GET /api/v1/users/[slug]/followers` and `/following` → paginated lists (`pageQuerySchema`), self-only via RLS (returns 404/empty for other users until public lists ship).
  - The profile page (`apps/web/app/(community)/u/[slug]/page.tsx`) reads `follower_count`/`following_count` from the existing `getUserProfile` query (fold into the existing bounded wave — **zero extra queries** by adding the two columns to its `columns` select) and an `isFollowing` flag via a single `follows` lookup in the same wave.
- **Rate limit** (see §6): `rateLimit('follow', session.userId)` on POST/DELETE — 20 follow/unfollow actions per 60s per user (prevents rapid follow-spam / follower-farming).
- **`new_follower` notification** (see §5): inserted by the follow service with `actorId = follower`, `userId = followee`, payload reusing `actorId`/`actorSlug`/`actorUsername` (no new payload field needed for follows).
- **Follow button home:** `apps/web/app/(community)/components/ProfileTabs.tsx` profile header — the `isMe ? <Edit> : null` ternary (≈lines 105-109) becomes `isMe ? <Edit> : <FollowButton isFollowing={isFollowing} slug={slug} />`.

---

## 3. Direct messages

### 3.1 Tables (3-table model, D9.2)

```ts
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(), // bumped by trigger on message insert
}, (t) => ({})).enableRLS();

export const conversationParticipants = pgTable('conversation_participants', {
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }), // for unread badges
}, (t) => ({
  pk: primaryKey({ columns: [t.conversationId, t.userId] }),
  byUserIdx: index('conversation_participants_user_idx').on(t.userId, t.joinedAt),
})).enableRLS();

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')                              // ← set null, NOT cascade (D9.4)
    .references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),                             // sanitized HTML (same pipeline as posts)
  contentPlain: text('content_plain').notNull(),            // for autoFlagIfWatched + search
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byConversationIdx: index('messages_conversation_created_idx').on(t.conversationId, t.createdAt),
})).enableRLS();
```

- **2-participant cap (launch):** enforced in the create-conversation service (reject >2 participant ids). The schema permits N participants; lifting the cap later is an app check, not a migration.
- `messages.authorId` is `set null` on erasure so the counterparty's thread survives (D9.4 / §8).

### 3.2 Triggers

```sql
-- Bump conversations.updated_at on each message (D9.7)
CREATE OR REPLACE FUNCTION update_conversation_updated_at() RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_updated_at ON messages;
CREATE TRIGGER trg_conversation_updated_at AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_updated_at();
```

### 3.3 RLS policies (participant-only reads — the core privacy guarantee)

| Table | Op | Policy |
|-------|----|--------|
| `conversations` | SELECT | `USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()))` |
| `conversations` | INSERT | `WITH CHECK (auth.uid() IS NOT NULL)` (the row is inert without participants; the service creates the conversation + its 2 participant rows in one transaction) |
| `conversations` | UPDATE/DELETE | admin only (`users … role IN ('admin','moderator')`) |
| `conversation_participants` | SELECT | `USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = auth.uid()))` — see your own memberships **and** the other participant of any conversation you're in |
| `conversation_participants` | INSERT | `WITH CHECK (user_id = auth.uid())` (you can add yourself; the service adds the other participant in the same transaction) |
| `conversation_participants` | DELETE | `USING (user_id = auth.uid())` (leave a conversation) |
| `messages` | SELECT | `USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()))` |
| `messages` | INSERT | `WITH CHECK (author_id = auth.uid() AND EXISTS (… participant check …))` |
| `messages` | DELETE | `USING (author_id = auth.uid())` (delete your own) + admin |
| `messages` | UPDATE | none (immutable), admin excepted |

> **Pool note (service layer, enforced in T9.2):** a conversation list page is bounded waves ≤3 — wave 1: my `conversation_participants` (paginated); wave 2: the conversation rows + the *other* participant's user row for each (via a single `inArray` on conversation ids, merged in JS — *not* a per-conversation fan-out). Message threads paginate with `limit+1` + `hasMore` on `messages.conversationId`, one query. No wide `Promise.all` of per-conversation fetches.

### 3.4 Realtime (extend the existing pattern)

- **Publication:** `ALTER PUBLICATION supabase_realtime ADD TABLE messages;` (the publication currently covers only `posts, comments, notifications` — `migrations/0001:144-147`). `conversations`/`conversation_participants` are **not** added (no live need; the `updated_at` sort is refreshed via `router.refresh()` on insert, same as the feed).
- **Channel:** `conversation:{conversationId}:messages`, filter `conversation_id=eq.{conversationId}` — copies `subscribeToPostComments` (`apps/web/lib/realtime.ts:166-198`) exactly.
- **Provider:** add `subscribeConversation(conversationId, onInsert, onStatus)` to `RealtimeProvider` (`apps/web/app/(community)/components/RealtimeProvider.tsx`) following the existing `Map<key,Set<listener>>` multiplex. `/messages` lives under `(community)` so the existing provider covers it (D9.5).

### 3.5 Content policy (D9.6)

- Message insert path mirrors `comments.ts:299` / `posts.ts:428`: inside the insert transaction, `await autoFlagIfWatched(tx, created.contentPlain, 'message', created.id)`.
- Requires adding `'message'` to the **flags target-type enum** (confirm the exact enum name in `schema.ts` at T9.1; the `autoFlagIfWatched` `targetType` param is typed against it) via a `DO $$ … ALTER TYPE ADD VALUE 'message'` block in 0016.
- `body` runs through the same sanitization/`htmlToText` as post/comment bodies; `contentPlain` is the stripped form.

### 3.6 Routes + rate limit + notification

- **Routes** (`runtime = 'nodejs'`):
  - `GET /api/v1/conversations` — my conversations (paginated, last-message preview derived in the bounded wave).
  - `POST /api/v1/conversations` — create a 1:1 conversation with a target user (idempotent by participant pair: reuse existing conversation if one exists with exactly these 2 participants).
  - `GET /api/v1/conversations/[id]/messages` — thread (paginated, oldest-first or newest-first per UX).
  - `POST /api/v1/conversations/[id]/messages` — send (inserts `new_message` notification for the other participant).
  - `POST /api/v1/conversations/[id]/read` — bump `lastReadAt` (clears unread badge).
- **UI:** `/messages` (inbox list) + `/messages/[id]` (thread), both client components under `(community)`; a `Messages` icon slots into `Header.tsx` next to `NotificationBell` (≈line 145); a profile "Message" button on `ProfileTabs.tsx` (next to Follow, hidden for `isMe`).
- **Rate limit (§6):** `rateLimit('message', session.userId)` — 30 messages / 60s per user. Conversation-create shares the same tier (a tighter "new conversations / min" sub-limit can be added later if abuse appears).
- **`new_message` notification (§5):** `actorId = sender`, `userId = recipient`, payload `{ conversationId, messageId, messagePreview }` (preview truncated ≈120 chars).

---

## 4. (Notifications covered in §5)

---

## 5. Notifications

### 5.1 Enum additions (3 lockstep edits + migration)

1. **TS const** — `packages/api/src/contracts/notifications.ts:3-11`: add
   ```ts
   NEW_FOLLOWER: 'new_follower',
   NEW_MESSAGE: 'new_message',
   ```
   to the `NotificationType` const. The `z.nativeEnum(NotificationType …)` zod schema picks them up automatically (it derives from the const — research `notifications.ts:12-15`).
2. **pgEnum array** — `packages/db/src/schema.ts:54`: append `'new_follower','new_message'` to the `notificationTypeEnum` array.
3. **SQL migration** — idempotent `DO $$ … ALTER TYPE ADD VALUE` blocks (the `'badge'` pattern, `migrations/0002:1-10`):
   ```sql
   DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.notification_type'::regtype AND enumlabel='new_follower') THEN
       ALTER TYPE "public"."notification_type" ADD VALUE 'new_follower'; END IF;
   END $$;
   DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.notification_type'::regtype AND enumlabel='new_message') THEN
       ALTER TYPE "public"."notification_type" ADD VALUE 'new_message'; END IF;
   END $$;
   ```

`insertNotification` (`apps/web/lib/services/notifications.ts:62-92`) is generic — it takes `{userId, actorId, type, payload}` and writes the row; new enum values flow through **unchanged** once the type is widened.

### 5.2 Payload fields

`notificationPayloadSchema` (`notifications.ts:21-33`) currently has `actorId/actorSlug/actorUsername` but **no** `conversationId`/`messageId`/`messagePreview`. Add three optional fields:

```ts
conversationId: z.string().uuid().optional(),
messageId: z.string().uuid().optional(),
messagePreview: z.string().max(160).optional(),
```

- `new_follower` reuses `actorId`/`actorSlug`/`actorUsername` (no new field needed for follows).
- `new_message` uses `actorId` (sender) + `conversationId` + `messageId` + `messagePreview`.

### 5.3 Bell rendering

`NotificationBell.tsx` `notificationText(n)` switch (≈lines 132-161) + `notificationHref(n)`:
```ts
case 'new_follower': return `${actorUsername} started following you`;        // href → `/u/${actorSlug}`
case 'new_message':  return `${actorUsername} sent you a message`;           // href → `/messages/${conversationId}`
```
The notifications list endpoint (`GET /api/v1/notifications`) and page are type-agnostic — new types surface with no further change.

---

## 6. Rate limits

Extend `RateLimitTier` + `TIER_CONFIG` in `apps/web/lib/rate-limit.ts:7-59` (fixed-window over Upstash Redis, keyed by `userId`):

```ts
export type RateLimitTier =
  | 'anonymousPublicRead' | 'authenticatedWrite' | 'authEndpoint'
  | 'mcp' | 'mcpRead' | 'mentionAutocomplete'
  | 'follow' | 'message';                       // ← new

// TIER_CONFIG additions:
follow:  { windowSeconds: 60, maxRequests: 20, keyPrefix: 'ratelimit:follow',  keyFn: (id) => `ratelimit:follow:${id}` },
message: { windowSeconds: 60, maxRequests: 30, keyPrefix: 'ratelimit:message', keyFn: (id) => `ratelimit:message:${id}` },
```

- Routes call `const limited = await rateLimit('<tier>', session.userId); if (limited) return limited;` — the exact shape from `apps/web/app/api/v1/users/search/route.ts:15-21`.
- **Fails open** if Redis is unreachable (existing behavior) — DM/follow writes still succeed when Redis is down.

---

## 7. Migration 0016

- **Hand-written SQL**, mirroring `0015_goofy_tarot.sql` exactly: `CREATE TABLE IF NOT EXISTS` with `--> statement-breakpoint` between statements; `ALTER TABLE … ENABLE ROW LEVEL SECURITY`; FKs wrapped in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$`; `CREATE INDEX IF NOT EXISTS`; RLS via `DROP POLICY IF EXISTS` then `CREATE POLICY`; comments cite `WS9/T9.x`.
- **Contents:**
  1. `CREATE TABLE follows`, `conversations`, `conversation_participants`, `messages` + indexes.
  2. Add `users.follower_count` / `users.following_count` (`ALTER TABLE … ADD COLUMN … DEFAULT 0 NOT NULL`).
  3. `notification_type` ADD VALUE `new_follower`/`new_message` (§5.1 #3).
  4. Flags target-type enum ADD VALUE `'message'` (§3.5).
  5. Trigger functions + triggers: `update_follow_counts`, `update_conversation_updated_at` (§2.2, §3.2).
  6. `ALTER PUBLICATION supabase_realtime ADD TABLE messages;` (§3.4).
  7. All RLS policies (§2.3, §3.3).
- **Snapshot sync:** hand-written migrations 0010–0013 historically required a follow-up snapshot-sync migration (0014) to stop `drizzle-kit` drift. **Recommendation:** after writing 0016 by hand, run `pnpm --filter @pm-operator/db drizzle-kit generate` to emit a matching `0016_*_snapshot.json` (or, if drift still appears, a 0017 snapshot-sync no-op like 0014). Confirm the team's preferred path (manual snapshot vs `generate`) at approval.

---

## 8. Retention + GDPR-erasure path (extends `docs/GDPR-ERASURE-RUNBOOK.md`)

The runbook is a 10-step numbered playbook; follows + DMs are **not** in it today. On approval, two runbook edits are made (spec'd here, executed at T9.1/T9.2):

**Section 3 — pre-erasure data export (add to the export list):**
- The user's `follows` rows (as follower and as followee).
- The user's `conversation_participants` memberships + the `conversations` they're in.
- The user's **sent** `messages` (body + timestamp + conversation id). Received messages are the *counterparty's* authored content; export only the subject's sent messages + conversation metadata, not the counterparty's bodies (note this limitation in the export).

**Section 5 — delete personal data (new cascade + per-entity steps):**

The existing `users` row delete already cascades to `follows` (cascade), `conversation_participants` (cascade), and `notifications` (recipient cascade + `actor_id` set-null). Two DM-specific steps must run **before** the `users` delete:

```sql
-- 1. Anonymize the subject's sent DM bodies (preserve counterparty thread continuity — D9.4)
UPDATE messages
   SET body = '[message deleted]', content_plain = '[message deleted]'
 WHERE author_id = <user>;
-- (the users-row delete then sets messages.author_id = NULL via onDelete: set null,
--  so the counterparty sees "[message deleted]" from "deleted-user")

-- 2. Hard-delete follows in both directions (ephemeral social edges — no retention value;
--    the count trigger decrements users.follower_count / following_count)
DELETE FROM follows WHERE follower_id = <user> OR followee_id = <user>;
```

Then the existing `users` delete proceeds; cascades remove `conversation_participants` rows for the subject. **Orphan cleanup:** after erasure, delete `conversations` that now have zero participants:
```sql
DELETE FROM conversations c WHERE NOT EXISTS (
  SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id
);
```
Conversations where the counterparty remains are **kept** (the counterparty can still read the thread; the subject's messages show as `[message deleted]` from an anonymized author).

- **`new_follower` / `new_message` notifications:** handled by the existing `notifications.actor_id` `onDelete: set null` (the erased user's handle disappears from others' inboxes; the notification row remains with a null actor). No extra step.
- **Flagged DMs:** a `flags` row pointing at a now-anonymized `message` row keeps the flag for moderator audit (the `target_id` still resolves to the `[message deleted]` row); this matches the runbook's existing "set to NULL if retention required" flags handling.

---

## 9. What stays out of v1 (deferred, noted for the roadmap)

- **Block / mute list** — no `follow_status` enum, no block table. Later, separate feature.
- **Public follower lists** (seeing who follows *someone else*) — counts are public, edge lists are self-only (§2.3).
- **Group DMs** — schema-ready, app-capped to 2 participants (D9.2).
- **Message search** — `contentPlain` is stored for future search + the content-policy path; no search route in v1.
- **Read receipts beyond `lastReadAt`** — only the unread badge derived from `lastReadAt < last message createdAt`.
- **DM email notifications** — `new_message` is in-app only for v1 (no Loops send); the existing `preferences.emailNotifications` gate can be wired later if requested.

---

## 10. Downstream edits once you approve (T9.1–T9.3)

This is the full edit list — **none of these run until you approve this addendum**:

**T9.1 — Follow graph:**
- `packages/db/src/schema.ts` — add `follows` table + `users.followerCount`/`followingCount` columns; extend `notificationTypeEnum` array with `'new_follower'`.
- `packages/db/migrations/0016_*.sql` — follows table, count columns, `new_follower` enum value, `update_follow_counts` trigger, RLS policies (§2.3).
- `packages/api/src/contracts/notifications.ts` — add `NEW_FOLLOWER` + optional payload fields (§5.2); rebuild `@pm-operator/api` dist.
- New `packages/api/src/contracts/follows.ts` — `followSchema`, `followButtonStateSchema`, list query schemas; re-export from `index.ts`.
- `apps/web/lib/services/follows.ts` — `followUser`, `unfollowUser`, `listFollowers`, `listFollowing`, `isFollowing` (each `db`-first, bounded).
- Routes: `POST/DELETE /api/v1/users/[slug]/follow`, `GET …/followers|following`.
- `ProfileTabs.tsx` — Follow button; `getUserProfile` gains `followerCount`/`followingCount`/`isFollowing` (folded into existing bounded wave).
- `apps/web/lib/rate-limit.ts` — add `follow` tier.
- `NotificationBell.tsx` — `new_follower` case + href.

**T9.2 — DMs:**
- `schema.ts` — `conversations`, `conversation_participants`, `messages` tables; flags target-type enum + `'message'`.
- `0016_*.sql` (same migration) — DM tables, `'new_message'` + `'message'` enum values, `update_conversation_updated_at` trigger, `ALTER PUBLICATION … ADD TABLE messages`, RLS policies (§3.3).
- `notifications.ts` — `NEW_MESSAGE` + payload fields (already added in T9.1).
- New `packages/api/src/contracts/messages.ts` — conversation/message schemas.
- `apps/web/lib/services/messages.ts` — `createConversation` (idempotent by pair), `listConversations`, `listMessages`, `sendMessage` (with `autoFlagIfWatched`), `markRead`.
- Routes: `GET/POST /api/v1/conversations`, `GET/POST /api/v1/conversations/[id]/messages`, `POST /api/v1/conversations/[id]/read`.
- `apps/web/lib/realtime.ts` + `RealtimeProvider.tsx` — `subscribeConversation`.
- `apps/web/app/(community)/messages/` — inbox + thread pages; `Header.tsx` Messages icon; profile Message button.
- `apps/web/lib/rate-limit.ts` — add `message` tier.
- `NotificationBell.tsx` — `new_message` case + `/messages/{id}` href.
- `docs/GDPR-ERASURE-RUNBOOK.md` — extend Section 3 + Section 5 (§8).

**T9.0 closure (documentation only — runs with approval):**
- `specs/SPEC_LOG.md` — append a `## Decisions made (2026-08-02)` block after the INVITE-3 addendum (≈line 199) recording D9.1–D9.8 in the established `- **<Topic>:** <decision + rationale>` voice; mark the line-183/191 "spec addendum required" bullets **Closed**.
- `docs/DESIGN-GAP-REPORT.md:224` — flip T9.0 to `[x]` with a dated note pointing here.

---

## 11. Open questions for you

1. **DM erasure retention (D9.4):** keep the counterparty's thread readable by blanking the subject's sent messages to `[message deleted]` (anonymize-retain) — my recommendation — or hard-delete the subject's sent messages entirely (the counterparty loses those messages from their thread, stricter erasure). I recommend anonymize-retain because it matches the runbook's existing posts/comments approach and preserves thread continuity; the tradeoff is the body is blanked, not removed.
2. **Public follower lists (§2.3):** counts are public, but the *who follows whom* edge list is self-only in v1. OK to defer public follower lists, or do you want them visible on profiles from day one?
3. **Snapshot sync for migration 0016 (§7):** `drizzle-kit generate` to emit the snapshot, or a hand-written 0017 snapshot-sync no-op like 0014? I recommend `drizzle-kit generate`.
4. **DM email notifications (§9):** in-app only for v1 (my recommendation), or wire `new_message` into Loops too (gated by `preferences.emailNotifications`)?

— End of T9.0 addendum. Awaiting your review before any T9.1+ code.