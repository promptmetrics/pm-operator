export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { notificationsQuerySchema, type NotificationsQuery } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { listNotifications, markRead } from '@/lib/services/notifications';

const markReadSchema = z.object({ id: z.string().uuid().optional() });

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const parsed = parseQuery(new URL(request.url).searchParams, notificationsQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = parsed as NotificationsQuery;

  const notifications = await listNotifications(getDb(), session.userId, query);
  return ok({ notifications });
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const body = await parseBody(request, markReadSchema);
  if (body instanceof Response) return body;

  if (body.id) {
    const notification = await markRead(getDb(), body.id, session.userId);
    return ok(notification);
  }

  const result = await getDb()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, session.userId),
        isNull(schema.notifications.readAt)
      )
    );

  return ok({ marked: (result as unknown as { count?: number }).count ?? 0 });
}
