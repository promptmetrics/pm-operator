export const runtime = 'nodejs';

import { listEventsQuerySchema, type ListEventsQuery } from '@pm-operator/api';
import {
  getDb,
  ok,
  parseQuery,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { listEvents } from '@/lib/services/events';
import { getSession } from '@/lib/auth/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const { slug } = await params;
  const parsed = parseQuery(new URL(request.url).searchParams, listEventsQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = { ...(parsed as ListEventsQuery), groupSlug: slug };

  const events = await listEvents(getDb(), query);
  return ok({ events });
}