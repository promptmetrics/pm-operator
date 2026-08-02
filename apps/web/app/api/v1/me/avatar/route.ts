export const runtime = 'nodejs';

import { eq } from 'drizzle-orm';
import { z, ErrorCode } from '@pm-operator/api';
import * as schema from '@pm-operator/db';
import {
  getDb,
  ok,
  error,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { getAvatarUploadUrl } from '@/lib/storage';

// Client asks for a signed upload URL for a chosen file; we validate size/type
// (env-driven, AUTH-4), mint a per-user storage path, persist that path on the
// user, and hand back the signed URL. The client then PUTs the bytes directly
// to Supabase Storage. Single upload-URL + single DB update (≤1 concurrent DB
// query — the Supabase call is Storage, not the Postgres pool).
const avatarRequestSchema = z.object({
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

  const body = await parseBody(request, avatarRequestSchema);
  if (body instanceof Response) return body;
  const { contentType, sizeBytes } = body as z.infer<typeof avatarRequestSchema>;

  let uploadUrl: string;
  try {
    const path = `${session.userId}/${crypto.randomUUID()}`;
    uploadUrl = await getAvatarUploadUrl(path, contentType, sizeBytes);
    await getDb()
      .update(schema.users)
      .set({ pictureUrl: path, updatedAt: new Date() })
      .where(eq(schema.users.id, session.userId));
  } catch (err: any) {
    // validateAvatarFile throws human-readable messages for bad size/type.
    return error(ErrorCode.VALIDATION_ERROR, err.message || 'Invalid avatar', 400);
  }

  return ok({ uploadUrl });
}