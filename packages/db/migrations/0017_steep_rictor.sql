DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.notification_type'::regtype AND enumlabel='new_message') THEN
   ALTER TYPE "public"."notification_type" ADD VALUE 'new_message'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.target_type'::regtype AND enumlabel='message') THEN
   ALTER TYPE "public"."target_type" ADD VALUE 'message'; END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"content_plain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint

-- T9.2 (WS9): DM tables, message-trigger, realtime publication, RLS.
-- Bump conversations.updated_at on each message so the inbox sorts by last
-- activity (D9.7). The codebase has no auto-updated_at trigger anywhere else;
-- this is a single-purpose message-insert trigger, not a general convention.
CREATE OR REPLACE FUNCTION update_conversation_updated_at() RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_conversation_updated_at ON messages;
--> statement-breakpoint
CREATE TRIGGER trg_conversation_updated_at AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_updated_at();
--> statement-breakpoint
-- Realtime: surface new messages to the (community) RealtimeProvider. Only
-- `messages` is added; conversations/conversation_participants have no live
-- need (inbox re-sort is refreshed via router.refresh() on insert).
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
--> statement-breakpoint

-- RLS: conversations (participant-only reads; admin write/delete)
DROP POLICY IF EXISTS "conversations_select" ON "conversations";
--> statement-breakpoint
CREATE POLICY "conversations_select" ON "conversations" FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid())
);
--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_insert" ON "conversations";
--> statement-breakpoint
CREATE POLICY "conversations_insert" ON "conversations" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_update" ON "conversations";
--> statement-breakpoint
CREATE POLICY "conversations_update" ON "conversations" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_delete" ON "conversations";
--> statement-breakpoint
CREATE POLICY "conversations_delete" ON "conversations" FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
--> statement-breakpoint

-- RLS: conversation_participants (see your own memberships + the other party
-- of any conversation you're in; self-insert; self-leave)
DROP POLICY IF EXISTS "conversation_participants_select" ON "conversation_participants";
--> statement-breakpoint
CREATE POLICY "conversation_participants_select" ON "conversation_participants" FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
);
--> statement-breakpoint
DROP POLICY IF EXISTS "conversation_participants_insert" ON "conversation_participants";
--> statement-breakpoint
CREATE POLICY "conversation_participants_insert" ON "conversation_participants" FOR INSERT WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
DROP POLICY IF EXISTS "conversation_participants_delete" ON "conversation_participants";
--> statement-breakpoint
CREATE POLICY "conversation_participants_delete" ON "conversation_participants" FOR DELETE USING (user_id = auth.uid());
--> statement-breakpoint

-- RLS: messages (participant-only reads; author-only insert; author/admin
-- delete; admin update for moderation)
DROP POLICY IF EXISTS "messages_select" ON "messages";
--> statement-breakpoint
CREATE POLICY "messages_select" ON "messages" FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
);
--> statement-breakpoint
DROP POLICY IF EXISTS "messages_insert" ON "messages";
--> statement-breakpoint
CREATE POLICY "messages_insert" ON "messages" FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
);
--> statement-breakpoint
DROP POLICY IF EXISTS "messages_update" ON "messages";
--> statement-breakpoint
CREATE POLICY "messages_update" ON "messages" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
--> statement-breakpoint
DROP POLICY IF EXISTS "messages_delete" ON "messages";
--> statement-breakpoint
CREATE POLICY "messages_delete" ON "messages" FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);