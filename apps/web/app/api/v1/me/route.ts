export const runtime = 'nodejs';

import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { patchMeRequestSchema, levelForScore, type UserPublicProfile } from '@pm-operator/api';
import {
  getDb,
  ok,
  notFound,
  requireSession,
  requireOnboarding,
  parseBody,
} from '@/lib/api/server';
import { updateUserProfile } from '@/lib/services/users';
import { getAvatarReadUrl } from '@/lib/storage';
import { toNumber } from '@/lib/services/shared';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const user = await getDb().query.users.findFirst({
    where: eq(schema.users.id, session.userId),
  });
  if (!user) return notFound('User not found');

  const profile: UserPublicProfile = {
    id: user.id,
    email: user.email,
    username: user.username,
    userslug: user.userslug,
    fullName: user.fullName,
    pictureUrl: await getAvatarReadUrl(user.pictureUrl),
    role: user.role as UserPublicProfile['role'],
    reputationScore: toNumber(user.reputationScore),
    level: levelForScore(toNumber(user.reputationScore)).level,
    streakDays: user.streakDays,
    painfulToolStackTask: user.painfulToolStackTask ?? '',
    onboardingComplete: Boolean(user.painfulToolStackTask && user.painfulToolStackTask.length > 0),
  };

  return ok(profile);
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const onboarding = await requireOnboarding(session.userId);
  if (onboarding) return onboarding;

  const body = await parseBody(request, patchMeRequestSchema);
  if (body instanceof Response) return body;

  const updated = await updateUserProfile(getDb(), session.userId, body);
  return ok(updated);
}
