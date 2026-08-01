-- WS4/T4.1: saved_posts (bookmarks). Self-only RLS mirroring the 0009 policy style.
CREATE TABLE IF NOT EXISTS "saved_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "post_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "saved_posts_user_post_idx" UNIQUE("user_id","post_id")
);

--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_post_id_posts_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "saved_posts_user_created_idx" ON "saved_posts" USING btree ("user_id","created_at");

--> statement-breakpoint

ALTER TABLE "saved_posts" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- saved_posts: self-only. Bookmarks are private to the user who saved them.
DROP POLICY IF EXISTS "saved_posts_select" ON "saved_posts";--> statement-breakpoint
CREATE POLICY "saved_posts_select" ON "saved_posts" FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "saved_posts_insert" ON "saved_posts";--> statement-breakpoint
CREATE POLICY "saved_posts_insert" ON "saved_posts" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "saved_posts_delete" ON "saved_posts";--> statement-breakpoint
CREATE POLICY "saved_posts_delete" ON "saved_posts" FOR DELETE TO authenticated USING (user_id = auth.uid());
