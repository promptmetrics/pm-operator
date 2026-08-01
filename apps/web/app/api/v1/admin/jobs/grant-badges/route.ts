export const runtime = 'nodejs';

import * as schema from '@pm-operator/db';
import { badgeCriteriaSchema } from '@pm-operator/api';
import { getDb, ok, forbidden } from '@/lib/api/server';
import { insertNotification } from '@/lib/services/notifications';
// Counting/qualification queries shared with the public badges endpoint.
import { findQualifyingUsers } from '@/lib/services/badges';

function authorizeCron(request: Request): Response | null {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const authorization = request.headers.get('authorization');
  if (authorization !== expected) {
    return forbidden('Unauthorized');
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const badges = await getDb().query.badges.findMany();
  let awarded = 0;

  for (const badge of badges) {
    const parsed = badgeCriteriaSchema.safeParse(badge.criteria);
    if (!parsed.success) continue;

    const userIds = await findQualifyingUsers(getDb(), parsed.data);

    for (const userId of userIds) {
      const [userBadge] = await getDb().transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.userBadges)
          .values({
            userId,
            badgeId: badge.id,
            awardedBy: null,
            context: { criteria: parsed.data },
          })
          .onConflictDoNothing({
            target: [schema.userBadges.userId, schema.userBadges.badgeId],
          })
          .returning();

        if (inserted) {
          await insertNotification(tx, {
            userId,
            actorId: null,
            type: 'badge',
            payload: { badgeSlug: badge.slug, badgeName: badge.name },
          });
        }

        return [inserted];
      });

      if (userBadge) awarded++;
    }
  }

  return ok({ awarded });
}
