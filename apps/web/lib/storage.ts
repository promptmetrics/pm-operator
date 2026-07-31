import 'server-only';

import { createClient } from '@supabase/supabase-js';

const AVATAR_BUCKET = 'avatars';
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 5 * 60;
const READ_TTL_SECONDS = 60 * 60;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase storage environment variables');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export function validateAvatarFile(sizeBytes: number, contentType: string): void {
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error('Avatar image must be 2 MB or smaller');
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Avatar image must be JPEG, PNG, or WebP');
  }
}

export async function getAvatarUploadUrl(
  path: string,
  contentType: string,
  sizeBytes: number
): Promise<string> {
  validateAvatarFile(sizeBytes, contentType);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUploadUrl(path, { expiresIn: UPLOAD_TTL_SECONDS } as any);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Failed to create avatar upload URL');
  }
  return data.signedUrl;
}

export async function getAvatarReadUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, READ_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Failed to create avatar read URL');
  }
  return data.signedUrl;
}
