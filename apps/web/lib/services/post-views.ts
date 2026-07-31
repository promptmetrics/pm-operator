import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { awardPostRead } from './points';

export async function recordPostView(
  db: DrizzleClient,
  postId: string,
  opts: { userId?: string; ip?: string }
): Promise<{ recorded: boolean; pointsAwarded?: number }> {
  try {
    await db.insert(schema.postViews).values({
      postId,
      userId: opts.userId ?? null,
      viewerIp: opts.ip ?? null,
    });
  } catch (err: any) {
    // Authenticated duplicate views are silently ignored via the unique
    // (post_id, user_id) index.
    if (err.message?.includes('unique constraint') && opts.userId) {
      return { recorded: false, pointsAwarded: 0 };
    }
    throw err;
  }

  if (!opts.userId) {
    return { recorded: true };
  }

  const { pointsEarned } = await awardPostRead(db, opts.userId, postId);
  return { recorded: true, pointsAwarded: pointsEarned };
}
