export const runtime = 'nodejs';

import { createWatchedPhraseRequestSchema, uuidSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  forbidden,
  notFound,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminListWatchedPhrases,
  adminCreateWatchedPhrase,
  adminDeleteWatchedPhrase,
} from '@/lib/services/admin';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const phrases = await adminListWatchedPhrases(getDb());
    return ok({ phrases });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, createWatchedPhraseRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const phrase = await adminCreateWatchedPhrase(getDb(), body);
    return ok(phrase, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) {
    return notFound('Watched phrase not found');
  }

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    await adminDeleteWatchedPhrase(getDb(), parsed.data);
    return new Response(null, { status: 204 });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Watched phrase not found') return notFound('Watched phrase not found');
    throw err;
  }
}
