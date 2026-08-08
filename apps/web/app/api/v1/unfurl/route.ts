// Node runtime required: the unfurl service uses node:dns for its SSRF guard.
export const runtime = 'nodejs';

import { unfurlRequestSchema, type UnfurlRequest } from '@pm-operator/api';
import { ok, requireSession, parseBody, rateLimit } from '@/lib/api/server';
import { unfurlUrl } from '@/lib/services/unfurl';

// Composer-side preview (track 2A). Cosmetic only — the create services
// re-fetch on save, so nothing returned here is ever trusted as input.
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('unfurl', session.userId);
  if (limited) return limited;

  const body = await parseBody(request, unfurlRequestSchema);
  if (body instanceof Response) return body;
  const input = body as UnfurlRequest;

  const preview = await unfurlUrl(input.url);

  return ok(preview);
}
