// Transactional + digest email via Loops (T8.4). Server-only.
//
// Loops API: POST https://app.loops.so/api/v1/transactional with
//   Authorization: Bearer <LOOPS_API_KEY>, body { email, transactionalId, dataVariables }
// Each transactional email is its own Loops template with its own ID, so we read
// per-event IDs from env. If a per-event ID is unset, we fall back to a single
// shared LOOPS_TRANSACTIONAL_QUEUE_ID template — so you can start with one
// template and add per-event templates later. When the key or the relevant ID is
// missing, every send degrades to a logged no-op and NEVER throws, so email can
// never break the calling (accept-solution / accept-invite / digest-cron) flow.
//
// Preference gating:
//   - Transactional (solution/invite): users.preferences.emailNotifications —
//     default ON (sent unless explicitly false).
//   - Weekly digest: users.preferences.weeklyDigest — default OFF (sent only
//     when explicitly true).

import 'server-only';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import type { DrizzleClient } from '@pm-operator/db';
import { logger } from '@/lib/logger';

const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const LOOPS_ENDPOINT = 'https://app.loops.so/api/v1/transactional';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';

const TX_ID = {
  solution_accepted:
    process.env.LOOPS_TX_SOLUTION_ACCEPTED_ID ||
    process.env.LOOPS_TRANSACTIONAL_QUEUE_ID,
  invite_accepted:
    process.env.LOOPS_TX_INVITE_ACCEPTED_ID ||
    process.env.LOOPS_TRANSACTIONAL_QUEUE_ID,
  weekly_digest:
    process.env.LOOPS_TX_WEEKLY_DIGEST_ID ||
    process.env.LOOPS_TRANSACTIONAL_QUEUE_ID,
} as const;

type TransactionalEvent = 'solution_accepted' | 'invite_accepted';

interface UserPrefs {
  emailNotifications?: boolean;
  weeklyDigest?: boolean;
  reducedMotion?: boolean;
  newsletter?: boolean;
}

export interface WeeklyDigestData {
  posts: number;
  solutionsAccepted: number;
  hotTopicName: string;
  hotTopicUrl: string;
  topContributors: string;
}

async function getRecipient(db: DrizzleClient, userId: string) {
  return db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true, username: true, fullName: true, preferences: true },
  });
}

async function loopsSend(
  transactionalId: string | undefined,
  email: string,
  dataVariables: Record<string, string | number>,
): Promise<void> {
  if (!LOOPS_API_KEY || !transactionalId) {
    logger.warn(
      { hasKey: Boolean(LOOPS_API_KEY), hasId: Boolean(transactionalId) },
      'Loops send skipped (not provisioned)',
    );
    return;
  }
  const res = await fetch(LOOPS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${LOOPS_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, transactionalId, dataVariables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn(
      { status: res.status, body: text.slice(0, 200) },
      'Loops transactional send failed',
    );
  }
}

/**
 * Send a transactional email (solution accepted, invite accepted). Honors
 * emailNotifications (default on). Never throws.
 */
export async function sendTransactional(
  event: TransactionalEvent,
  opts: {
    db: DrizzleClient;
    userId: string;
    dataVariables: Record<string, string | number>;
  },
): Promise<void> {
  try {
    const recipient = await getRecipient(opts.db, opts.userId);
    if (!recipient?.email) return;
    const prefs = (recipient.preferences ?? {}) as UserPrefs;
    if (prefs.emailNotifications === false) return;
    await loopsSend(TX_ID[event], recipient.email, {
      name: recipient.fullName || recipient.username,
      ...opts.dataVariables,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Transactional email send failed');
  }
}

/**
 * Send the weekly digest email to a single opted-in recipient. Pure Loops POST
 * — no DB fetch. The weekly-digest cron owns the opted-in user batch (filtered
 * by users.preferences.weeklyDigest = true) and calls this per recipient, so
 * the pool stays unstressed (one batch query, then network-only sends). Never
 * throws.
 */
export async function sendWeeklyDigestEmail(
  opts: { email: string; name: string; data: WeeklyDigestData },
): Promise<void> {
  try {
    await loopsSend(TX_ID.weekly_digest, opts.email, {
      name: opts.name,
      weekPosts: opts.data.posts,
      weekSolutions: opts.data.solutionsAccepted,
      hotTopicName: opts.data.hotTopicName,
      hotTopicUrl: opts.data.hotTopicUrl,
      topContributors: opts.data.topContributors,
      digestUrl: `${SITE_URL}/digest`,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Weekly digest email send failed');
  }
}