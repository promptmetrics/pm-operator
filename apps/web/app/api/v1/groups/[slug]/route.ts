export const runtime = 'nodejs';

import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createGroupRequestSchema } from '@pm-operator/api';
import { getSession } from '@/lib/auth/server';
import {
  getDb,
  ok,
  forbidden,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
  rateLimit,
  getClientIp,
} from '@/lib/api/server';
import { getGroupBySlug, updateGroup } from '@/lib/services/groups';
import { isAdminOrModerator } from '@/lib/services/shared';

const updateGroupSchema = createGroupRequestSchema.partial();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
  if (limited) return limited;

  const { slug } = await params;
  const { session } = await getSession();
  const group = await getGroupBySlug(getDb(), slug, session?.user?.id);
  if (!group) return notFound('Group not found');
  return ok(group);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, updateGroupSchema);
  if (body instanceof Response) return body;

  const { slug } = await params;
  const group = await updateGroup(getDb(), slug, body, session.userId);
  return ok(group);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const writeLimited = await rateLimit('authenticatedWrite', session.userId);
  if (writeLimited) return writeLimited;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const { slug } = await params;
  const group = await getDb().query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) return notFound('Group not found');

  const user = await getDb().query.users.findFirst({
    where: eq(schema.users.id, session.userId),
    columns: { role: true },
  });

  const isGroupAdminOrMod = await getDb().query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, group.id),
      eq(schema.groupMemberships.userId, session.userId)
    ),
    columns: { role: true },
  });

  const canDelete =
    user?.role === 'admin' ||
    isAdminOrModerator(isGroupAdminOrMod?.role ?? '') ||
    group.createdBy === session.userId;

  if (!canDelete) return forbidden();

  await getDb().delete(schema.groups).where(eq(schema.groups.id, group.id));
  return ok({ deleted: true });
}
