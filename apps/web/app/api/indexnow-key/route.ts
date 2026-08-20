export const runtime = 'nodejs';

// Serves the IndexNow key-ownership file. Reached only through the
// next.config.ts rewrite of /{INDEXNOW_KEY}.txt — the key never lives in the
// repo, so rotation is a Vercel env change plus redeploy. The protocol
// requires the file body to be exactly the key.
export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
