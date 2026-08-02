CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"url" text,
	"capacity" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_group_starts_idx" ON "events" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint

-- events: public read (events are listed in the community rail/calendar). Writes
-- restricted to site-admins/moderators, or the admin/moderator of the event's
-- circle (global events with group_id IS NULL are site-admin-only to write).
DROP POLICY IF EXISTS "events_select" ON "events";--> statement-breakpoint
CREATE POLICY "events_select" ON "events" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "events_insert" ON "events";--> statement-breakpoint
CREATE POLICY "events_insert" ON "events" FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_id = events.group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
);--> statement-breakpoint
DROP POLICY IF EXISTS "events_update" ON "events";--> statement-breakpoint
CREATE POLICY "events_update" ON "events" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_id = events.group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
);--> statement-breakpoint
DROP POLICY IF EXISTS "events_delete" ON "events";--> statement-breakpoint
CREATE POLICY "events_delete" ON "events" FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_id = events.group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
);