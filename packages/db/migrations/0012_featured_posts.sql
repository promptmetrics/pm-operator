-- WS7/T7.2: admin-set feature label for posts ("Build of the week" etc.);
-- null = not featured. No enum values created or referenced, so it is safe
-- inside the migrator's single batched transaction.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "featured_label" text;
