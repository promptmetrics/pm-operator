import { eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';

// Feed onboarding checklist (plan §4.7, no new tables). Serves the 70%
// onboarding-completion target: join circles / first post / first comment.
export const CHECKLIST_CIRCLE_TARGET = 2;

export interface OnboardingChecklistStatus {
  circleCount: number;
  hasPost: boolean;
  hasComment: boolean;
  /** Steps done, 0–3 (circles step counts once circleCount ≥ target). */
  completedCount: number;
}

/**
 * True when the feed page must not run the checklist query at all: the user
 * dismissed the card, or completion was already cached into preferences by
 * a previous render (write-once `checklistCompletedAt`). Steady-state cost
 * for finished users is therefore zero queries.
 */
export function shouldSkipOnboardingChecklist(
  preferences: Record<string, unknown> | null | undefined
): boolean {
  if (!preferences) return false;
  return Boolean(preferences.checklistDismissed) || Boolean(preferences.checklistCompletedAt);
}

/**
 * Checklist progress in ONE SQL statement: three scalar subqueries anchored
 * on the viewer's users row. Returns null without touching the DB when
 * preferences say dismissed/complete.
 *
 * On the first render where all 3 steps are complete, stamps
 * `preferences.checklistCompletedAt` (sequential follow-up write, jsonb merge
 * so concurrent preference writes aren't clobbered) — after that the caller's
 * skip check short-circuits every future request. At most ONE query is in
 * flight at any moment (pool budget; see DB pool starvation trap).
 */
export async function getOnboardingChecklistStatus(
  db: DrizzleClient,
  userId: string,
  preferences: Record<string, unknown> | null | undefined
): Promise<OnboardingChecklistStatus | null> {
  if (shouldSkipOnboardingChecklist(preferences)) return null;

  const rows = await db
    .select({
      circleCount: sql<number>`(
        select count(*) from ${schema.groupMemberships}
        where ${schema.groupMemberships.userId} = ${userId}
      )`,
      hasPost: sql<boolean>`exists (
        select 1 from ${schema.posts}
        where ${schema.posts.authorId} = ${userId}
          and ${schema.posts.status} <> 'deleted'
      )`,
      hasComment: sql<boolean>`exists (
        select 1 from ${schema.comments}
        where ${schema.comments.authorId} = ${userId}
          and ${schema.comments.status} <> 'deleted'
      )`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const row = rows[0];
  if (!row) return null;

  const status: OnboardingChecklistStatus = {
    circleCount: Number(row.circleCount),
    hasPost: Boolean(row.hasPost),
    hasComment: Boolean(row.hasComment),
    completedCount: 0,
  };
  status.completedCount = [
    status.circleCount >= CHECKLIST_CIRCLE_TARGET,
    status.hasPost,
    status.hasComment,
  ].filter(Boolean).length;

  if (status.completedCount === 3) {
    await db
      .update(schema.users)
      .set({
        preferences: sql`coalesce(${schema.users.preferences}, '{}'::jsonb)
          || jsonb_build_object('checklistCompletedAt', ${new Date().toISOString()}::text)`,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  }

  return status;
}
