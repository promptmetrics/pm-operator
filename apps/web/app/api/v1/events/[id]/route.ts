export const runtime = 'nodejs';

import { updateEventRequestSchema, type UpdateEventRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  notFound,
  forbidden,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { getEvent, updateEvent, deleteEvent } from '@/lib/services/events';
import { getSession } from '@/lib/auth/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const { id } = await params;
  const event = await getEvent(getDb(), id);
  if (!event) return notFound('Event not found');
  return ok(event);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, updateEventRequestSchema);
  if (body instanceof Response) return body;
  const input = body as UpdateEventRequest;

  const { id } = await params;
  try {
    const event = await updateEvent(getDb(), id, input, session.userId);
    return ok(event);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Not allowed to edit this event');
    if (err.message === 'Event not found') return notFound('Event not found');
    throw err;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const { id } = await params;
  try {
    const result = await deleteEvent(getDb(), id, session.userId);
    return ok(result);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Not allowed to delete this event');
    if (err.message === 'Event not found') return notFound('Event not found');
    throw err;
  }
}