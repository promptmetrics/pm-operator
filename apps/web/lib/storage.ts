import 'server-only';

import { createClient } from '@supabase/supabase-js';

const AVATAR_BUCKET = 'avatars';
const UPLOAD_TTL_SECONDS = 5 * 60;
const READ_TTL_SECONDS = 60 * 60;

// AUTH-4 Must: avatar limits are env-driven, not hardcoded. Read per-call so
// operators can tune them without a redeploy of the schema/contract.
function maxBytes(): number {
  const env = Number(process.env.AVATAR_MAX_BYTES);
  return Number.isFinite(env) && env > 0 ? env : 2 * 1024 * 1024;
}
function allowedContentTypes(): Set<string> {
  const env = process.env.AVATAR_ALLOWED_TYPES;
  if (env && env.trim()) {
    return new Set(
      env
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    );
  }
  return new Set(['image/jpeg', 'image/png', 'image/webp']);
}

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
  const max = maxBytes();
  if (sizeBytes > max) {
    throw new Error(`Avatar image must be ${Math.round(max / 1024 / 1024)} MB or smaller`);
  }
  const allowed = allowedContentTypes();
  if (!allowed.has(contentType)) {
    throw new Error(`Avatar image must be one of: ${[...allowed].join(', ')}`);
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
    // Missing seed/placeholder avatars are not fatal; return null and let the
    // UI fall back to initials. Other storage errors still surface loudly.
    const isNotFound =
      error?.name === 'StorageApiError' &&
      (Number(error.statusCode) === 404 || /not found/i.test(error.message));
    if (isNotFound) {
      return null;
    }
    throw error ?? new Error('Failed to create avatar read URL');
  }
  return data.signedUrl;
}
