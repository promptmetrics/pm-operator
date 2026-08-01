-- One streak_bonus point event per user per UTC day (WS2/T2.4),
-- mirroring point_events_daily_visit_idx. Separate from 0010 because the
-- predicate resolves the streak_bonus enum value, which must be committed
-- (by 0010) in an earlier transaction first.
CREATE UNIQUE INDEX IF NOT EXISTS "point_events_streak_bonus_idx" ON "point_events" USING btree ("user_id",CAST(("awarded_at" AT TIME ZONE 'UTC') AS date)) WHERE "point_events"."event_type" = 'streak_bonus';
