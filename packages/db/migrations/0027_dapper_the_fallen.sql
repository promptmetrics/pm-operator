-- Profile bio points bonus + profile links/headline (SEO content plan Phase 3,
-- 2026-08-22).
--
-- ADD VALUE is hand-wrapped in a guarded DO block (drizzle-kit emits it bare;
-- see 0024) so a rerun or partially-applied migration replays cleanly.
-- The partial unique index is 0028, NOT here: its predicate resolves the
-- profile_bio enum value, which must be committed in an earlier transaction
-- first (55P04 — same reason 0011 followed 0010).
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.point_event_type'::regtype AND enumlabel='profile_bio') THEN
   ALTER TYPE "public"."point_event_type" ADD VALUE 'profile_bio'; END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "headline" text;