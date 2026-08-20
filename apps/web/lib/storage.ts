import 'server-only';

import { createClient } from '@supabase/supabase-js';

const AVATAR_BUCKET = 'avatars';
const POST_IMAGE_BUCKET = 'post-images';
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

// Post images share the same type/size rules as avatars for simplicity.
function maxPostImageBytes(): number {
  const env = Number(process.env.POST_IMAGE_MAX_BYTES);
  return Number.isFinite(env) && env > 0 ? env : 5 * 1024 * 1024;
}
function allowedPostImageTypes(): Set<string> {
  const env = process.env.POST_IMAGE_ALLOWED_TYPES;
  if (env && env.trim()) {
    return new Set(
      env
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    );
  }
  return new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
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

export function validatePostImageFile(sizeBytes: number, contentType: string): void {
  const max = maxPostImageBytes();
  if (sizeBytes > max) {
    throw new Error(`Image must be ${Math.round(max / 1024 / 1024)} MB or smaller`);
  }
  const allowed = allowedPostImageTypes();
  if (!allowed.has(contentType)) {
    throw new Error(`Image must be one of: ${[...allowed].join(', ')}`);
  }
}

export async function getPostImageUploadUrl(
  path: string,
  contentType: string,
  sizeBytes: number
): Promise<string> {
  validatePostImageFile(sizeBytes, contentType);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .createSignedUploadUrl(path, { expiresIn: UPLOAD_TTL_SECONDS } as any);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Failed to create image upload URL');
  }
  return data.signedUrl;
}

// Post images are served through /api/img/{userId}/{objectId} instead of
// Supabase signed URLs. Signed URLs expire after an hour, so every crawler,
// CDN, and Google Images reference went stale — and each serialization paid a
// Supabase signing round trip per image. Object paths are write-once UUIDs
// (see uploads/post-image/route.ts), so the proxy URL is stable and immutable.
const POST_IMAGE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPostImageObjectPath(userId: string, objectId: string): boolean {
  return POST_IMAGE_UUID_RE.test(userId) && POST_IMAGE_UUID_RE.test(objectId);
}

export function postImageProxyUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const relativePath = path.replace(/^(?:\/)?post-images\//, '');
  const segments = relativePath.split('/');
  if (segments.length !== 2 || !isPostImageObjectPath(segments[0], segments[1])) {
    return null;
  }
  return `/api/img/${segments[0]}/${segments[1]}`;
}

export async function downloadPostImage(
  relativePath: string
): Promise<{ blob: Blob; contentType: string } | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .download(relativePath);
  if (error || !data) {
    const isNotFound =
      error?.name === 'StorageApiError' &&
      (Number((error as any).statusCode) === 404 || /not found/i.test(error.message));
    if (isNotFound) return null;
    throw error ?? new Error('Failed to download post image');
  }
  return { blob: data, contentType: data.type || 'application/octet-stream' };
}

