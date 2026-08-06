export const runtime = 'nodejs';

import { z, ErrorCode } from '@pm-operator/api';
import {
  getDb,
  ok,
  error,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { getPostImageUploadUrl } from '@/lib/storage';

const uploadRequestSchema = z.object({
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, uploadRequestSchema);
  if (body instanceof Response) return body;
  const { contentType, sizeBytes } = body as z.infer<typeof uploadRequestSchema>;

  // Return the public, bucket-qualified path for storage in post/comment HTML.
  // The actual Supabase object path is relative to the bucket, so the upload
  // helper receives the path without the bucket prefix.
  const storagePath = `${session.userId}/${crypto.randomUUID()}`;
  const path = `/post-images/${storagePath}`;
  let uploadUrl: string;
  try {
    uploadUrl = await getPostImageUploadUrl(storagePath, contentType, sizeBytes);
  } catch (err: any) {
    const message = err.message || 'Invalid image';
    // Supabase returns a generic message when the bucket does not exist.
    if (/related resource does not exist|bucket.*not found/i.test(message)) {
      return error(
        ErrorCode.VALIDATION_ERROR,
        'Image storage is not configured. Ask an admin to run the post-images bucket migration.',
        400
      );
    }
    return error(ErrorCode.VALIDATION_ERROR, message, 400);
  }

  return ok({ uploadUrl, path });
}
