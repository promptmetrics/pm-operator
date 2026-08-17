-- MCP admin tool audit-log actions (2026-08-14).
--
-- Six new audit_log_action values emitted by the MCP admin tools (community:admin
-- scope): create_group, award_points, create_badge, award_badge,
-- watched_phrase_create, watched_phrase_delete. Without them adminCreateAuditLog
-- (whose action param is typed off the enum) wouldn't compile, and a runtime
-- insert would 500 after the mutation committed — same class of bug 0024 fixed.
--
-- ADD VALUE is guarded rather than bare (the generator emits bare), matching
-- 0024, 0010, and 0017, so a rerun or a partially-applied migration replays
-- cleanly. The migrator wraps each migration in one transaction; ADD VALUE
-- without *using* the new value in that same transaction is safe in PG >=12.

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='create_group') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'create_group'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='award_points') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'award_points'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='create_badge') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'create_badge'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='award_badge') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'award_badge'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='watched_phrase_create') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'watched_phrase_create'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='watched_phrase_delete') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'watched_phrase_delete'; END IF;
END $$;