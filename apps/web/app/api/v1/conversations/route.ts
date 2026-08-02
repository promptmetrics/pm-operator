export const runtime = 'nodejs';

import {
  getDb,
  ok,
  error,
  requireSession,
  requireOnboarding,
  parseBody,
  parseQuery,
  rateLimit,
  paginationMeta,
} from '@/lib/api/server';
import {
  conversationListQuerySchema,
  createConversationRequestSchema,
} from '@pm-operator/api';
import { createConversation, listConversations } from '@/lib/services/messages';

// GET /api/v1/conversations — my inbox, newest activity first.
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const query = parseQuery(new URL(request.url).searchParams, conversationListQuerySchema);
  if (query instanceof Response) return query;

  const { items, hasMore } = await listConversations(getDb(), session.userId, query);
  return ok({ conversations: items }, paginationMeta(query.page, query.limit, hasMore));
}

// POST /api/v1/conversations — start (or reuse) a 1:1 conversation with a
// target user. Idempotent by participant pair.
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const limited = await rateLimit('message', session.userId);
  if (limited) return limited;

  const body = await parseBody(request, createConversationRequestSchema);
  if (body instanceof Response) return body;

  try {
    const result = await createConversation(getDb(), session.userId, body);
    return ok(result, undefined, 201);
  } catch (err) {
    if (err instanceof Error && err.message === 'Cannot start a conversation with yourself') {
      return error('VALIDATION_ERROR', err.message, 400, 'targetUserId');
    }
    throw err;
  }
}