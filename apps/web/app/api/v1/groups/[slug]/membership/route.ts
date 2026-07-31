export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { joinGroupRequestSchema } from '@pm-operator/api';
import {
  getDb,
  ok,
  error,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
  parseQuery,
  rateLimit,
} from '@/lib/api/server';
import { ErrorCode } from '@pm-operator/api';
import {
  getGroupBySlug,
  joinGroup,
  leaveGroup,
  removeMember,
} from '@/lib/services/groups';
import { isAdminOrModerator } from '@/lib/services/shared';

const leaveQuerySchema = z.object({ userId: z.string().uuid().optional() });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { slug } = await params;
  const group = await getGroupBySlug(getDb(), slug, session.userId);
  if (!group) return notFound('Group not found');

  const membership = await getDb().query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, group.id),
      eq(schema.groupMemberships.userId, session.userId)
    ),
  });

  return ok(membership ?? null);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, joinGroupRequestSchema);
  if (body instanceof Response) return body;

  const { slug } = await params;
  const membership = await joinGroup(getDb(), slug, session.userId, body);
  return ok(membership);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const { slug } = await params;
  const group = await getGroupBySlug(getDb(), slug, session.userId);
  if (!group) return notFound('Group not found');

  const query = parseQuery(new URL(request.url).searchParams, leaveQuerySchema);
  if (query instanceof Response) return query;

  const targetUserId = query.userId ?? session.userId;

  try {
    if (targetUserId !== session.userId) {
      const user = await getDb().query.users.findFirst({
        where: eq(schema.users.id, session.userId),
        columns: { role: true },
      });
      const membership = await getDb().query.groupMemberships.findFirst({
        where: and(
          eq(schema.groupMemberships.groupId, group.id),
          eq(schema.groupMemberships.userId, session.userId)
        ),
        columns: { role: true },
      });
      if (!isAdminOrModerator(user?.role ?? '') && !isAdminOrModerator(membership?.role ?? '')) {
        return notFound('Membership not found');
      }
      await removeMember(getDb(), slug, targetUserId, session.userId);
    } else {
      await leaveGroup(getDb(), slug, session.userId);
    }
  } catch (err: any) {
    if (err.message === 'Cannot remove the last admin from a group') {
      return error(ErrorCode.CONFLICT, err.message, 409);
    }
    throw err;
  }

  return ok({ left: true });
}
