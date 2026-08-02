export const runtime = 'nodejs';

import { getDb, ok, notFound, requireSession, rateLimit } from '@/lib/api/server';
import { getConversation } from '@/lib/services/messages';

// GET /api/v1/conversations/[id] — conversation meta (partner, last message,
// unread count) for the thread header. Participant-only.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const { id } = await params;
  const conversation = await getConversation(getDb(), id, session.userId);
  if (!conversation) return notFound('Conversation not found');

  return ok(conversation);
}