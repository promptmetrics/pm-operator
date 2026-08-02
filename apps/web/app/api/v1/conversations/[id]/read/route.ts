export const runtime = 'nodejs';

import { getDb, ok, notFound, requireSession, rateLimit } from '@/lib/api/server';
import { markRead } from '@/lib/services/messages';

// POST /api/v1/conversations/[id]/read — bump lastReadAt to clear the unread
// badge for this conversation.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const { id } = await params;
  const updated = await markRead(getDb(), id, session.userId);
  if (!updated) return notFound('Conversation not found');

  return ok({ read: true });
}