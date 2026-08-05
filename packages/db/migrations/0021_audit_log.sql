CREATE TYPE "public"."audit_log_action" AS ENUM('flag_resolved', 'flag_dismissed', 'post_approved', 'post_declined', 'user_warned', 'user_banned', 'content_hidden');

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "audit_log_action" NOT NULL,
	"target_type" "target_type",
	"target_id" uuid,
	"target_user_id" uuid,
	"circle_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" ("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_circle_idx" ON "audit_logs" ("circle_id", "created_at");

DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_circle_id_groups_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."groups"("id") ON DELETE set null;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
