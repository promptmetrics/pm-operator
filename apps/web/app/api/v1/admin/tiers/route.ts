export const runtime = 'nodejs';

import { createTierRequestSchema, patchTierRequestSchema, z } from '@pm-operator/api';
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
  adminListTiers,
  adminCreateTier,
  adminPatchTier,
} from '@/lib/services/admin';

const patchTierBodySchema = patchTierRequestSchema.extend({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const tiers = await adminListTiers(getDb());
    return ok({ tiers });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, createTierRequestSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const tier = await adminCreateTier(getDb(), body);
    return ok(tier, undefined, 201);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, patchTierBodySchema);
  if (body instanceof Response) return body;

  const { id, ...input } = body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const tier = await adminPatchTier(getDb(), id, input);
    return ok(tier);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'Tier not found') return notFound('Tier not found');
    throw err;
  }
}
