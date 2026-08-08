export const runtime = 'nodejs';

import { paletteQuerySchema } from '@pm-operator/api';
import { getDb, ok, parseQuery, rateLimit, requireSession } from '@/lib/api/server';
import { getPaletteResults } from '@/lib/services/search';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  // Keystroke-driven typeahead: share the mention-autocomplete budget, keyed
  // by user (same tier as /api/v1/users/search).
  const limited = await rateLimit('mentionAutocomplete', session.userId);
  if (limited) return limited;

  const query = parseQuery(new URL(request.url).searchParams, paletteQuerySchema);
  if (query instanceof Response) return query;

  const result = await getPaletteResults(getDb(), query.q, session.userId);
  return ok(result);
}
