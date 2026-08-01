-- WS2/T2.5 + T2.3 groundwork (SPEC_LOG 2026-08-01, decisions D1-D3).
-- 1. streak_bonus point event type
-- 2. users.longest_streak_days
-- 3. user_scores.period_start so weekly/monthly windows have an identity
-- 4. apply_point_event() writes all_time + weekly + monthly rows
-- 5. backfill weekly/monthly windows from point_events history

ALTER TYPE "point_event_type" ADD VALUE IF NOT EXISTS 'streak_bonus' BEFORE 'manual_award';--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "longest_streak_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "user_scores" ADD COLUMN IF NOT EXISTS "period_start" date DEFAULT '1970-01-01' NOT NULL;--> statement-breakpoint

ALTER TABLE "user_scores" DROP CONSTRAINT IF EXISTS "user_scores_pk";--> statement-breakpoint

ALTER TABLE "user_scores" ADD CONSTRAINT "user_scores_pk" UNIQUE ("user_id", "group_id", "period", "period_start");--> statement-breakpoint

DROP INDEX IF EXISTS "user_scores_score_idx";--> statement-breakpoint

CREATE INDEX "user_scores_score_idx" ON "user_scores" ("group_id", "period", "period_start", "score");--> statement-breakpoint

-- Rewrite the trigger: every point event now maintains the all-time row plus
-- the current weekly and monthly windows (previously only 'all_time' was ever
-- written, so the shipped "This week" leaderboard was empty by construction).
CREATE OR REPLACE FUNCTION apply_point_event()
RETURNS TRIGGER AS $$
DECLARE
  global_group_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  target_group_id uuid;
  event_at timestamptz;
BEGIN
  target_group_id := COALESCE(NEW.group_id, global_group_id);
  event_at := COALESCE(NEW.awarded_at, now());

  UPDATE users
  SET reputation_score = reputation_score + NEW.points
  WHERE id = NEW.user_id;

  INSERT INTO user_scores (user_id, group_id, period, period_start, score, updated_at)
  VALUES
    (NEW.user_id, target_group_id, 'all_time', '1970-01-01'::date, NEW.points, now()),
    (NEW.user_id, target_group_id, 'weekly', date_trunc('week', event_at)::date, NEW.points, now()),
    (NEW.user_id, target_group_id, 'monthly', date_trunc('month', event_at)::date, NEW.points, now())
  ON CONFLICT (user_id, group_id, period, period_start)
  DO UPDATE SET
    score = user_scores.score + EXCLUDED.score,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

-- Backfill weekly windows from history.
INSERT INTO user_scores (user_id, group_id, period, period_start, score, updated_at)
SELECT
  user_id,
  COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
  'weekly',
  date_trunc('week', awarded_at)::date,
  SUM(points),
  now()
FROM point_events
GROUP BY 1, 2, 4
ON CONFLICT (user_id, group_id, period, period_start)
DO UPDATE SET
  score = EXCLUDED.score,
  updated_at = now();--> statement-breakpoint

-- Backfill monthly windows from history.
INSERT INTO user_scores (user_id, group_id, period, period_start, score, updated_at)
SELECT
  user_id,
  COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
  'monthly',
  date_trunc('month', awarded_at)::date,
  SUM(points),
  now()
FROM point_events
GROUP BY 1, 2, 4
ON CONFLICT (user_id, group_id, period, period_start)
DO UPDATE SET
  score = EXCLUDED.score,
  updated_at = now();--> statement-breakpoint

-- 6. users.streak_last_date: the UTC day the streak last advanced (T2.3).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak_last_date" date;--> statement-breakpoint

-- 7. The streak_bonus partial unique index lives in migration 0011: its
--    predicate references the enum value added above, which Postgres cannot
--    resolve inside the same transaction that added it (and the drizzle
--    migrator batches all pending migrations into one transaction).
