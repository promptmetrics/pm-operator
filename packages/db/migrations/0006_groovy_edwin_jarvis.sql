DROP INDEX IF EXISTS "posts_content_trgm_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_content_trgm_idx" ON "posts" USING gin (lower("content_plain") gin_trgm_ops);