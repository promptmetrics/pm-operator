export const runtime = 'nodejs';

import { downloadPostImage, isPostImageObjectPath } from '@/lib/storage';

// Stable, same-origin post-image URLs. The stored object path is two
// write-once UUIDs (`{userId}/{objectId}`, see uploads/post-image/route.ts):
// a new cover means a new objectId, so responses are safely immutable. The
// strict UUID validation is the access boundary — it blocks traversal and
// bucket scanning; possession of a URL is the same trust model as a shared
// Supabase signed link, minus the hourly expiry that broke crawlers and CDNs.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!Array.isArray(path) || path.length !== 2 || !isPostImageObjectPath(path[0], path[1])) {
    return new Response('Bad request', { status: 400 });
  }

  const image = await downloadPostImage(`${path[0]}/${path[1]}`);
  if (!image) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(image.blob.stream(), {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
