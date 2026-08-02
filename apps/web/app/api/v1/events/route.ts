export const runtime = 'nodejs';

import { listEventsQuerySchema, createEventRequestSchema, type ListEventsQuery, type CreateEventRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  notFound,
  forbidden,
  requireSession,
  requireOnboarding,
  parseQuery,
  parseBody,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { createEvent, listEvents } from '@/lib/services/events';
import { getSession } from '@/lib/auth/server';

export async function GET(request: Request) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const parsed = parseQuery(new URL(request.url).searchParams, listEventsQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = parsed as ListEventsQuery;

  const events = await listEvents(getDb(), query);
  return ok({ events });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, createEventRequestSchema);
  if (body instanceof Response) return body;
  const input = body as CreateEventRequest;

  try {
    const event = await createEvent(getDb(), input, session.userId);
    return ok(event, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Not allowed to create events');
    if (err.message === 'Group not found') return notFound('Group not found');
    throw err;
  }
}