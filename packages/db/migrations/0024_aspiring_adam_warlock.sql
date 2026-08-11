-- Admin audit-log actions and targets (2026-08-11).
--
-- Every admin route except moderation/approval passed an `action` that was never
-- a member of audit_log_action, so Postgres rejected the audit insert AFTER the
-- mutation had already committed: the change landed and the request still 500'd.
-- Eight endpoints were affected (settings save, MCP client revoke, group
-- update/delete, user role change, user delete, invite create/revoke).
--
-- audit_target_type is a NEW enum rather than five more values on target_type,
-- deliberately: target_type belongs to flags and reactions, which only ever point
-- at content, and widening it also widens the inferred select type there — which
-- broke the FlagTargetType mapping in lib/services/flags.ts when attempted.
--
-- ADD VALUE is guarded rather than bare (the generator emits bare), matching
-- 0010 and 0017, so a rerun or a partially-applied migration replays cleanly.

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_target_type') THEN
   CREATE TYPE "public"."audit_target_type" AS ENUM('post', 'comment', 'message', 'settings', 'group', 'mcp_client', 'user', 'invite');
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='settings_update') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'settings_update'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='mcp_client_revoke') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'mcp_client_revoke'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='update_group') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'update_group'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='delete_group') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'delete_group'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='update_user_role') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'update_user_role'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='delete_user') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'delete_user'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='create_invite') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'create_invite'; END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.audit_log_action'::regtype AND enumlabel='revoke_invite') THEN
   ALTER TYPE "public"."audit_log_action" ADD VALUE 'revoke_invite'; END IF;
END $$;
--> statement-breakpoint
-- Postgres will not cast between two enum types implicitly, so this needs an
-- explicit round-trip through text; the generated statement omitted the USING and
-- would have failed with "column cannot be cast automatically". Lossless: the
-- column is nullable and every stored value is post/comment/message, all of which
-- are members of the new type.
ALTER TABLE "audit_logs" ALTER COLUMN "target_type" SET DATA TYPE "public"."audit_target_type" USING "target_type"::text::"public"."audit_target_type";
