-- SEO-friendly post URLs (Option B: /g/<groupSlug>/<postSlug>).
-- Backfill deterministic slugs for existing posts before enforcing not-null / uniqueness.

ALTER TABLE "posts" ADD COLUMN "slug" text;--> statement-breakpoint

UPDATE "posts"
SET "slug" = lower(regexp_replace(regexp_replace(left("title", 50), '[^a-zA-Z0-9]+', '-', 'g'), '^-|-$', '', 'g')) || '-' || substr("id"::text, 1, 8);--> statement-breakpoint

ALTER TABLE "posts" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posts_group_slug_idx" ON "posts" USING btree ("group_id","slug");--> statement-breakpoint
