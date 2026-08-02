-- Snapshot-sync no-op. Migrations 0010–0013 were hand-written without
-- updating drizzle-kit's meta snapshots, so `drizzle-kit generate` (run by
-- turbo as a typecheck/build dependency) re-emitted their DDL here as drift.
-- Everything this migration originally contained is already applied
-- everywhere; the 0014 snapshot brings the meta state back in line with
-- schema.ts so generate stops producing duplicates.
SELECT 1;
