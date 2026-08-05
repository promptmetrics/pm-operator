export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  parseQuery,
  forbidden,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminGetSettings,
  adminUpdateSettings,
  adminCreateAuditLog,
  adminListMcpClients,
} from '@/lib/services/admin';

const sectionSchema = z.enum([
  'branding',
  'privacy',
  'onboarding',
  'notifications',
  'moderation',
  'analytics',
]);

const getQuerySchema = z.object({
  section: sectionSchema.optional(),
});

const patchBodySchema = z.object({
  section: sectionSchema,
  values: z.record(z.unknown()),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, getQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    const settings = await adminGetSettings(getDb());

    if (query.section) {
      return ok({ section: query.section, values: settings[query.section] });
    }

    return ok({ settings });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, patchBodySchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    await adminUpdateSettings(getDb(), body.section, body.values);

    await adminCreateAuditLog(getDb(), {
      adminId: session.userId,
      actionType: 'settings_update',
      targetType: 'settings',
      details: { section: body.section, changedKeys: Object.keys(body.values) },
    });

    return ok({ updated: true, section: body.section });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
