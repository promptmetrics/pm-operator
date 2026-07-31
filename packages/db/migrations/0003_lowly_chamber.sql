DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.point_event_type'::regtype
      AND enumlabel = 'manual_award'
  ) THEN
    ALTER TYPE "public"."point_event_type" ADD VALUE 'manual_award';
  END IF;
END $$;