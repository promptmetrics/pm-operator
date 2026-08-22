-- One profile_bio award per user (SEO content plan Phase 3). Separate from
-- 0027 because this predicate resolves the profile_bio enum value, which must
-- be committed in an earlier transaction first (55P04 — the same reason
-- 0011_streak_bonus_index followed 0010). migrate.ts runs each migration in
-- its own transaction, so the enum value is committed by the time this runs.
CREATE UNIQUE INDEX IF NOT EXISTS "point_events_profile_bio_idx" ON "point_events" USING btree ("user_id") WHERE "point_events"."event_type" = 'profile_bio';
