DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.notification_type'::regtype
      AND enumlabel = 'new_follower'
  ) THEN
    ALTER TYPE "public"."notification_type" ADD VALUE 'new_follower';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "follower_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "following_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_followee_idx" ON "follows" USING btree ("followee_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_follower_idx" ON "follows" USING btree ("follower_id","created_at");--> statement-breakpoint

-- Maintain users.following_count / users.follower_count (the groups.member_count
-- pattern from 0001). GREATEST guards against negative counts on edge cases.
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.followee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE users SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.followee_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_follow_counts ON follows;--> statement-breakpoint
CREATE TRIGGER trg_follow_counts
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();--> statement-breakpoint

-- follows RLS (decision 2A): edge lists are self-only; counts are public (read
-- from users.follower_count/following_count, not from this table). A user may
-- only create/delete their own outgoing follows.
DROP POLICY IF EXISTS "follows_select" ON follows;--> statement-breakpoint
CREATE POLICY "follows_select" ON follows FOR SELECT TO authenticated USING (
  follower_id = auth.uid() OR followee_id = auth.uid()
);--> statement-breakpoint
DROP POLICY IF EXISTS "follows_insert" ON follows;--> statement-breakpoint
CREATE POLICY "follows_insert" ON follows FOR INSERT TO authenticated WITH CHECK (
  follower_id = auth.uid()
);--> statement-breakpoint
DROP POLICY IF EXISTS "follows_delete" ON follows;--> statement-breakpoint
CREATE POLICY "follows_delete" ON follows FOR DELETE TO authenticated USING (
  follower_id = auth.uid()
);