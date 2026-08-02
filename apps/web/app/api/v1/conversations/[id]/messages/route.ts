export const runtime = 'nodejs';

import {
  getDb,
  ok,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
  parseQuery,
  rateLimit,
  paginationMeta,
} from '@/lib/api/server';
import { listMessagesQuerySchema, sendMessageRequestSchema } from '@pm-operator/api';
import { listMessages, sendMessage } from '@/lib/services/messages';

// GET /api/v1/conversations/[id]/messages — thread, oldest-first, paginated.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const query = parseQuery(new URL(request.url).searchParams, listMessagesQuerySchema);
  if (query instanceof Response) return query;

  const { id } = await params;
  const result = await listMessages(getDb(), id, session.userId, query);
  if (!result) return notFound('Conversation not found');

  return ok({ messages: result.items }, paginationMeta(query.page, query.limit, result.hasMore));
}

// POST /api/v1/conversations/[id]/messages — send a message.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const limited = await rateLimit('message', session.userId);
  if (limited) return limited;

  const body = await parseBody(request, sendMessageRequestSchema);
  if (body instanceof Response) return body;

  const { id } = await params;
  const message = await sendMessage(getDb(), id, session.userId, body);
  if (!message) return notFound('Conversation not found');

  return ok(message, undefined, 201);
}