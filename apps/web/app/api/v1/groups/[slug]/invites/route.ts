export const runtime = 'nodejs';

import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createInviteRequestSchema, type CreateInviteRequest } from '@pm-operator/api';
import {
  getDb,
  ok,
  forbidden,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
} from '@/lib/api/server';
import { getGroupBySlug, createInvite } from '@/lib/services/groups';
import { isAdminOrModerator } from '@/lib/services/shared';

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
    columns: { role: true },
  });
  const user = await getDb().query.users.findFirst({
    where: eq(schema.users.id, session.userId),
    columns: { role: true },
  });

  if (!isAdminOrModerator(user?.role ?? '') && !isAdminOrModerator(membership?.role ?? '')) {
    return forbidden();
  }

  const invites = await getDb().query.groupInvites.findMany({
    where: eq(schema.groupInvites.groupId, group.id),
    orderBy: [schema.groupInvites.createdAt],
  });

  return ok({ invites });
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

  const body = await parseBody(request, createInviteRequestSchema);
  if (body instanceof Response) return body;
  const input = body as CreateInviteRequest;

  const { slug } = await params;
  const invite = await createInvite(getDb(), slug, input, session.userId);
  return ok(invite);
}
