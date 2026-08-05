import { eq, and, or, sql, desc, asc, count, like, inArray, gte, lte, isNull } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Group,
  CreateGroupRequest,
  MembershipTier,
  CreateTierRequest,
  PatchTierRequest,
  WatchedPhrase,
  CreateWatchedPhraseRequest,
  Badge,
  CreateBadgeRequest,
  UserListItem,
  UserRole,
  AwardPointsRequest,
  AgentActionListItem,
} from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { isAdminOrModerator, toISO, toNumber } from './shared';
import { awardPoints } from './points';
import { insertNotification } from './notifications';

export async function requireGlobalAdmin(
  db: DrizzleClient,
  userId: string
): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  if (user?.role !== 'admin') {
    throw new Error('Forbidden');
  }
}

// Groups
export async function adminListGroups(db: DrizzleClient): Promise<Group[]> {
  const rows = await db.query.groups.findMany({
    orderBy: [schema.groups.name],
  });
  return rows.map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    description: g.description,
    color: g.color,
    visibility: g.visibility,
    requiredTierId: g.requiredTierId,
    memberCount: g.memberCount,
    createdBy: g.createdBy,
    createdAt: toISO(g.createdAt),
    updatedAt: toISO(g.updatedAt),
  }));
}

export async function adminCreateGroup(
  db: DrizzleClient,
  input: CreateGroupRequest,
  createdById: string
): Promise<Group> {
  const [group] = await db
    .insert(schema.groups)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description,
      color: input.color,
      visibility: input.visibility,
      requiredTierId: input.requiredTierId,
      createdBy: createdById,
    })
    .returning();

  if (!group) throw new Error('Failed to create group');

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    color: group.color,
    visibility: group.visibility,
    requiredTierId: group.requiredTierId,
    memberCount: group.memberCount,
    createdBy: group.createdBy,
    createdAt: toISO(group.createdAt),
    updatedAt: toISO(group.updatedAt),
  };
}

// Tiers
export async function adminListTiers(db: DrizzleClient): Promise<MembershipTier[]> {
  const rows = await db.query.membershipTiers.findMany({
    orderBy: [schema.membershipTiers.name],
  });
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    price: t.price ? toNumber(t.price) : null,
    currency: t.currency,
    interval: t.interval,
    features: (t.features ?? []) as string[],
    isActive: t.isActive,
    createdAt: toISO(t.createdAt),
    updatedAt: toISO(t.updatedAt),
  }));
}

export async function adminCreateTier(
  db: DrizzleClient,
  input: CreateTierRequest
): Promise<MembershipTier> {
  const [tier] = await db
    .insert(schema.membershipTiers)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description,
      price: input.price !== undefined ? String(input.price) : null,
      currency: input.currency,
      interval: input.interval,
      features: input.features,
      isActive: input.isActive,
    })
    .returning();

  if (!tier) throw new Error('Failed to create tier');

  return {
    id: tier.id,
    slug: tier.slug,
    name: tier.name,
    description: tier.description,
    price: tier.price ? toNumber(tier.price) : null,
    currency: tier.currency,
    interval: tier.interval,
    features: (tier.features ?? []) as string[],
    isActive: tier.isActive,
    createdAt: toISO(tier.createdAt),
    updatedAt: toISO(tier.updatedAt),
  };
}

export async function adminPatchTier(
  db: DrizzleClient,
  id: string,
  input: PatchTierRequest
): Promise<MembershipTier> {
  const existing = await db.query.membershipTiers.findFirst({
    where: eq(schema.membershipTiers.id, id),
  });
  if (!existing) throw new Error('Tier not found');

  const update: Partial<typeof schema.membershipTiers.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if ('price' in input) update.price = input.price !== undefined ? String(input.price) : null;
  if (input.currency !== undefined) update.currency = input.currency;
  if (input.interval !== undefined) update.interval = input.interval;
  if (input.features !== undefined) update.features = input.features;
  if (input.isActive !== undefined) update.isActive = input.isActive;

  const [tier] = await db
    .update(schema.membershipTiers)
    .set(update)
    .where(eq(schema.membershipTiers.id, id))
    .returning();

  if (!tier) throw new Error('Failed to update tier');

  return {
    id: tier.id,
    slug: tier.slug,
    name: tier.name,
    description: tier.description,
    price: tier.price ? toNumber(tier.price) : null,
    currency: tier.currency,
    interval: tier.interval,
    features: (tier.features ?? []) as string[],
    isActive: tier.isActive,
    createdAt: toISO(tier.createdAt),
    updatedAt: toISO(tier.updatedAt),
  };
}

// Watched phrases
export async function adminListWatchedPhrases(
  db: DrizzleClient
): Promise<WatchedPhrase[]> {
  const rows = await db.query.watchedPhrases.findMany({
    orderBy: [schema.watchedPhrases.phrase],
  });
  return rows.map((p) => ({
    id: p.id,
    phrase: p.phrase,
    sanctionedFraming: p.sanctionedFraming,
    isRegex: p.isRegex,
    autoFlag: p.autoFlag,
    createdAt: toISO(p.createdAt),
  }));
}

export async function adminCreateWatchedPhrase(
  db: DrizzleClient,
  input: CreateWatchedPhraseRequest
): Promise<WatchedPhrase> {
  const [phrase] = await db
    .insert(schema.watchedPhrases)
    .values({
      phrase: input.phrase,
      sanctionedFraming: input.sanctionedFraming,
      isRegex: input.isRegex,
      autoFlag: input.autoFlag,
    })
    .returning();

  if (!phrase) throw new Error('Failed to create watched phrase');

  return {
    id: phrase.id,
    phrase: phrase.phrase,
    sanctionedFraming: phrase.sanctionedFraming,
    isRegex: phrase.isRegex,
    autoFlag: phrase.autoFlag,
    createdAt: toISO(phrase.createdAt),
  };
}

export async function adminDeleteWatchedPhrase(
  db: DrizzleClient,
  id: string
): Promise<void> {
  const existing = await db.query.watchedPhrases.findFirst({
    where: eq(schema.watchedPhrases.id, id),
  });
  if (!existing) throw new Error('Watched phrase not found');

  await db.delete(schema.watchedPhrases).where(eq(schema.watchedPhrases.id, id));
}

// Points
export async function adminAwardPoints(
  db: DrizzleClient,
  actorId: string,
  input: AwardPointsRequest
): Promise<{ awarded: boolean }> {
  const user = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.userslug})`, input.userSlug.toLowerCase()),
  });
  if (!user) throw new Error('User not found');

  const event = await awardPoints(db, {
    userId: user.id,
    eventType: 'manual_award',
    points: input.points,
    context: { reason: input.reason, actorId },
  });

  return { awarded: event !== null };
}

// Badges
export async function adminListBadges(db: DrizzleClient): Promise<Badge[]> {
  const rows = await db.query.badges.findMany({
    orderBy: [schema.badges.sortOrder, schema.badges.name],
  });
  return rows.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    iconUrl: b.iconUrl,
    criteria: b.criteria as Badge['criteria'],
    sortOrder: b.sortOrder,
    createdAt: toISO(b.createdAt),
  }));
}

export async function adminCreateBadge(
  db: DrizzleClient,
  input: CreateBadgeRequest
): Promise<Badge> {
  const [badge] = await db
    .insert(schema.badges)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description,
      iconUrl: input.iconUrl,
      criteria: input.criteria,
      sortOrder: input.sortOrder,
    })
    .returning();

  if (!badge) throw new Error('Failed to create badge');

  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    iconUrl: badge.iconUrl,
    criteria: badge.criteria as Badge['criteria'],
    sortOrder: badge.sortOrder,
    createdAt: toISO(badge.createdAt),
  };
}

export async function adminAwardBadge(
  db: DrizzleClient,
  badgeId: string,
  actorId: string,
  userSlug: string,
  reason?: string
): Promise<void> {
  const [user, badge] = await Promise.all([
    db.query.users.findFirst({
      where: eq(sql`lower(${schema.users.userslug})`, userSlug.toLowerCase()),
    }),
    db.query.badges.findFirst({
      where: eq(schema.badges.id, badgeId),
    }),
  ]);

  if (!user) throw new Error('User not found');
  if (!badge) throw new Error('Badge not found');

  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.userBadges)
      .values({
        userId: user.id,
        badgeId: badge.id,
        awardedBy: actorId,
        context: { reason: reason ?? 'manual award' },
      })
      .onConflictDoNothing({
        target: [schema.userBadges.userId, schema.userBadges.badgeId],
      })
      .returning();

    if (inserted) {
      await insertNotification(tx, {
        userId: user.id,
        actorId,
        type: 'badge',
        payload: { badgeSlug: badge.slug, badgeName: badge.name, reason },
      });
    }
  });
}

// Users
export async function adminListUsers(
  db: DrizzleClient,
  query: { q?: string; role?: UserRole; page: number; limit: number }
): Promise<{ users: UserListItem[]; hasMore: boolean }> {
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof like> | ReturnType<typeof sql>)[] = [];

  if (query.q) {
    const term = `%${query.q.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${schema.users.username})`, term),
        like(sql`lower(${schema.users.userslug})`, term),
        like(sql`lower(${schema.users.email})`, term)
      )!
    );
  }

  if (query.role) {
    conditions.push(eq(schema.users.role, query.role));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.limit;

  const rows = await db.query.users.findMany({
    where,
    orderBy: [desc(schema.users.createdAt)],
    limit: query.limit + 1,
    offset,
  });

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;

  const users: UserListItem[] = slice.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    userslug: u.userslug,
    fullName: u.fullName,
    pictureUrl: u.pictureUrl,
    role: u.role as UserRole,
    reputationScore: toNumber(u.reputationScore),
    streakDays: u.streakDays,
    level: levelForScore(toNumber(u.reputationScore)).level,
    painfulToolStackTask: u.painfulToolStackTask ?? '',
    onboardingComplete: Boolean(u.painfulToolStackTask && u.painfulToolStackTask.length > 0),
    createdAt: toISO(u.createdAt),
  }));

  return { users, hasMore };
}

export async function adminSetUserRole(
  db: DrizzleClient,
  userId: string,
  role: UserRole
): Promise<void> {
  const [updated] = await db
    .update(schema.users)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) throw new Error('User not found');
}

// T8.12 (ADMIN-5): admin-only audit list of MCP agent actions. List UI only.
// Pool-safe: two sequential queries — (1) the actions page (findMany, limit+1
// for hasMore, newest first, optional clientId/toolName filters), then (2) the
// usernames for just the user ids on that page (inArray, bounded by page size).
// input/output are truncated to previews so the audit list stays triage-sized.
const ACTION_PREVIEW_LIMIT = 280;

function truncatePreview(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'string') text = value;
  else text = JSON.stringify(value);
  if (text.length <= ACTION_PREVIEW_LIMIT) return text;
  return `${text.slice(0, ACTION_PREVIEW_LIMIT)}…`;
}

export async function adminListAgentActions(
  db: DrizzleClient,
  query: { clientId?: string; toolName?: string; startDate?: string; endDate?: string; page: number; limit: number }
): Promise<{ actions: AgentActionListItem[]; hasMore: boolean }> {
  const conditions: ReturnType<typeof eq | typeof gte | typeof lte>[] = [];
  if (query.clientId) conditions.push(eq(schema.agentActions.clientId, query.clientId));
  if (query.toolName) conditions.push(eq(schema.agentActions.toolName, query.toolName));
  if (query.startDate) conditions.push(gte(schema.agentActions.createdAt, new Date(query.startDate)));
  if (query.endDate) conditions.push(lte(schema.agentActions.createdAt, new Date(query.endDate)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.limit;

  const rows = await db.query.agentActions.findMany({
    where,
    orderBy: [desc(schema.agentActions.createdAt)],
    limit: query.limit + 1,
    offset,
  });

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;

  const userIds = Array.from(
    new Set(slice.map((r) => r.userId).filter((id): id is string => Boolean(id)))
  );
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db.query.users.findMany({
      where: inArray(schema.users.id, userIds),
      columns: { id: true, username: true },
    });
    for (const u of users) nameById.set(u.id, u.username);
  }

  const actions: AgentActionListItem[] = slice.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    userId: r.userId,
    username: r.userId ? nameById.get(r.userId) ?? null : null,
    toolName: r.toolName,
    error: r.error,
    durationMs: r.durationMs,
    inputPreview: truncatePreview(r.input),
    outputPreview: truncatePreview(r.output),
    createdAt: toISO(r.createdAt),
  }));

  return { actions, hasMore };
}

// Audit log
export async function adminCreateAuditLog(
  db: DrizzleClient,
  input: {
    actorId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    targetUserId?: string | null;
    circleId?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(schema.auditLogs).values({
    actorId: input.actorId,
    action: input.action as any,
    targetType: input.targetType as any ?? null,
    targetId: input.targetId ?? null,
    targetUserId: input.targetUserId ?? null,
    circleId: input.circleId ?? null,
    details: (input.details ?? {}) as any,
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: (input.metadata ?? {}) as Record<string, unknown>,
  });
