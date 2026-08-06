-- Private Supabase Storage bucket for post and comment inline image uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  false,
  5242880, -- 5 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-only upload. Object path is expected to be <auth.uid>/<filename>.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'post_images_owner_insert'
  ) THEN
    CREATE POLICY post_images_owner_insert ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'post-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END
$$;

-- Owner-only update/replace.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'post_images_owner_update'
  ) THEN
    CREATE POLICY post_images_owner_update ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'post-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'post-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END
$$;

-- Owner-only delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'post_images_owner_delete'
  ) THEN
    CREATE POLICY post_images_owner_delete ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'post-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END
$$;

-- No anonymous read policy; applications serve images via signed URLs.
