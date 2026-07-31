DROP INDEX IF EXISTS "point_events_daily_visit_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "point_events_daily_visit_idx" ON "point_events" USING btree ("user_id",CAST(("awarded_at" AT TIME ZONE 'UTC') AS date)) WHERE "point_events"."event_type" = 'daily_visit';-- Private Supabase Storage bucket for avatar uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-only upload. Object path is expected to be <auth.uid>/<filename>.
CREATE POLICY avatars_owner_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-only update/replace.
CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-only delete.
CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- No anonymous read policy; applications serve avatars via signed URLs.
