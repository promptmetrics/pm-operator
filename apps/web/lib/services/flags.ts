import { eq, and, desc, inArray } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Flag,
  CreateFlagRequest,
  ResolveFlagRequest,
  FlagQuery,
} from '@pm-operator/api';
import { toISO, isAdminOrModerator } from './shared';
import { insertNotification } from './notifications';

async function isModerator(db: DrizzleClient, userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  return isAdminOrModerator(user?.role ?? '');
}

function matchesPhrase(content: string, phrase: string, isRegex: boolean): boolean {
  if (isRegex) {
    try {
      const re = new RegExp(phrase, 'iu');
      return re.test(content);
    } catch {
      return false;
    }
  }
  return content.toLowerCase().includes(phrase.toLowerCase());
}

export async function autoFlagIfWatched(
  db: DrizzleClient,
  contentPlain: string,
  targetType: 'post' | 'comment',
  targetId: string
): Promise<void> {
  const phrases = await db.query.watchedPhrases.findMany();
  const matches = phrases.filter(
    (p) => p.autoFlag && matchesPhrase(contentPlain, p.phrase, p.isRegex)
  );
  if (matches.length === 0) return;

  const phraseList = matches.map((m) => m.phrase).join(', ');
  const suggestions = matches
    .filter((m) => m.sanctionedFraming)
    .map((m) => `${m.phrase} → ${m.sanctionedFraming}`)
    .join('; ');

  const reason = suggestions
    ? `Auto-flagged for watched phrases: ${phraseList}. Suggested framing: ${suggestions}`
    : `Auto-flagged for watched phrases: ${phraseList}`;

  await db.insert(schema.flags).values({
    targetType,
    targetId,
    reporterId: null,
    reason,
    autoFlagged: true,
  });
}

export async function createFlag(
  db: DrizzleClient,
  input: CreateFlagRequest,
  reporterId: string
): Promise<Flag> {
  const [flag] = await db
    .insert(schema.flags)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      reporterId,
      reason: input.reason ?? null,
      autoFlagged: false,
    })
    .returning();

  if (!flag) throw new Error('Failed to create flag');

  return {
    id: flag.id,
    targetType: flag.targetType,
    targetId: flag.targetId,
    reporterId: flag.reporterId,
    reason: flag.reason,
    autoFlagged: flag.autoFlagged,
    status: flag.status,
    resolverId: flag.resolverId,
    resolutionNote: flag.resolutionNote,
    resolvedAt: flag.resolvedAt ? toISO(flag.resolvedAt) : null,
    createdAt: toISO(flag.createdAt),
    updatedAt: toISO(flag.updatedAt),
  };
}

export async function listFlags(
  db: DrizzleClient,
  query: FlagQuery,
  currentUserId: string
): Promise<Flag[]> {
  if (!(await isModerator(db, currentUserId))) {
    throw new Error('Forbidden');
  }

  const rows = await db.query.flags.findMany({
    where: query.status ? eq(schema.flags.status, query.status) : undefined,
    orderBy: [desc(schema.flags.createdAt)],
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
  });

  return rows.map((f) => ({
    id: f.id,
    targetType: f.targetType,
    targetId: f.targetId,
    reporterId: f.reporterId,
    reason: f.reason,
    autoFlagged: f.autoFlagged,
    status: f.status,
    resolverId: f.resolverId,
    resolutionNote: f.resolutionNote,
    resolvedAt: f.resolvedAt ? toISO(f.resolvedAt) : null,
    createdAt: toISO(f.createdAt),
    updatedAt: toISO(f.updatedAt),
  }));
}

export async function resolveFlag(
  db: DrizzleClient,
  id: string,
  input: ResolveFlagRequest,
  resolverId: string
): Promise<Flag> {
  if (!(await isModerator(db, resolverId))) {
    throw new Error('Forbidden');
  }

  const flag = await db.query.flags.findFirst({
    where: eq(schema.flags.id, id),
  });
  if (!flag) throw new Error('Flag not found');

  const [resolved] = await db
    .update(schema.flags)
    .set({
      status: input.status,
      resolverId,
      resolutionNote: input.resolutionNote ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.flags.id, id))
    .returning();

  if (!resolved) throw new Error('Failed to resolve flag');

  // Optionally transition target status when resolved.
  if (input.status === 'resolved') {
    if (flag.targetType === 'post') {
      await db
        .update(schema.posts)
        .set({ status: 'hidden', updatedAt: new Date() })
        .where(eq(schema.posts.id, flag.targetId));
    } else if (flag.targetType === 'comment') {
      await db
        .update(schema.comments)
        .set({ status: 'hidden', updatedAt: new Date() })
        .where(eq(schema.comments.id, flag.targetId));
    }
  }

  if (flag.reporterId) {
    await insertNotification(db, {
      userId: flag.reporterId,
      actorId: resolverId,
      type: 'flag_resolved',
      payload: { flagId: resolved.id, reason: resolved.resolutionNote ?? undefined },
    });
  }

  return {
    id: resolved.id,
    targetType: resolved.targetType,
    targetId: resolved.targetId,
    reporterId: resolved.reporterId,
    reason: resolved.reason,
    autoFlagged: resolved.autoFlagged,
    status: resolved.status,
    resolverId: resolved.resolverId,
    resolutionNote: resolved.resolutionNote,
    resolvedAt: resolved.resolvedAt ? toISO(resolved.resolvedAt) : null,
    createdAt: toISO(resolved.createdAt),
    updatedAt: toISO(resolved.updatedAt),
  };
}
