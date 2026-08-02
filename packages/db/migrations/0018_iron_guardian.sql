-- T9 security hardening (adversarial review 2026-08-02). Three RLS fixes;
-- no schema/column changes, so the snapshot is identical to 0017.

-- (1) BLOCKER — conversation_participants_insert previously allowed any
-- authenticated user to self-add to ANY conversation whose UUID they learned
-- (user_id = auth.uid()), thereby passing every participant-only SELECT policy
-- and realtime delivery. Participant creation is server-only: the app connects
-- via DATABASE_URL with the postgres (service) role, which BYPASSes RLS, so
-- createConversation's inserts still work. Direct PostgREST clients (anon key +
-- user JWT) are the RLS boundary, so deny their inserts here.
DROP POLICY IF EXISTS "conversation_participants_insert" ON "conversation_participants";--> statement-breakpoint
CREATE POLICY "conversation_participants_insert" ON "conversation_participants"
  FOR INSERT TO authenticated WITH CHECK (false);--> statement-breakpoint

-- (2) Self-follow guard — follows_insert had no follower_id <> followee_id
-- guard, so a self-edge inflated both of the user's public counters via the
-- update_follow_counts trigger. Guard at the policy AND with a table CHECK
-- constraint (defense-in-depth). Remove any pre-existing self-edges first so
-- the CHECK doesn't fail on bad historical rows.
DELETE FROM "follows" WHERE "follower_id" = "followee_id";--> statement-breakpoint
DROP POLICY IF EXISTS "follows_insert" ON "follows";--> statement-breakpoint
CREATE POLICY "follows_insert" ON "follows" FOR INSERT TO authenticated WITH CHECK (
  "follower_id" = auth.uid() AND "follower_id" <> "followee_id"
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_check"
    CHECK ("follower_id" <> "followee_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- (3) Nit — conversations_insert defaulted to TO public (no explicit role),
-- inconsistent with the follows policies. No leak today (anon has auth.uid()
-- NULL so the CHECK failed), but scope it to TO authenticated for clarity and
-- to prevent a future rewrite from opening an unauthenticated path.
DROP POLICY IF EXISTS "conversations_insert" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_insert" ON "conversations"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);