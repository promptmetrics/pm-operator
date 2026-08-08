-- Track 2A: server-generated link preview cards ({url, domain, title, desc}).
-- Nullable, no backfill — old content renders without cards. No enum values
-- created or referenced, so it is safe inside a batched transaction.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "link_preview" jsonb;

--> statement-breakpoint

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "link_preview" jsonb;
