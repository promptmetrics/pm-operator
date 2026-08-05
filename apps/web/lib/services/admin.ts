import { eq, and, or, sql, desc, count, like, inArray, gte, lte } from 'drizzle-orm';
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
  query: { clientId?: string; toolName?: string; page: number; limit: number }
): Promise<{ actions: AgentActionListItem[]; hasMore: boolean }> {
  const conditions = [];
  if (query.clientId) conditions.push(eq(schema.agentActions.clientId, query.clientId));
  if (query.toolName) conditions.push(eq(schema.agentActions.toolName, query.toolName));
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
}

export async function adminListAuditLogs(
  db: DrizzleClient,
  query: {
    moderatorId?: string;
    actionType?: string;
    circleId?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }
): Promise<{ logs: any[]; hasMore: boolean }> {
  const conditions: any[] = [];

  if (query.moderatorId) {
    conditions.push(eq(schema.auditLogs.actorId, query.moderatorId));
  }
  if (query.actionType) {
    conditions.push(eq(schema.auditLogs.action, query.actionType as any));
  }
  if (query.circleId) {
    conditions.push(eq(schema.auditLogs.circleId, query.circleId));
  }
  if (query.dateFrom) {
    conditions.push(gte(schema.auditLogs.createdAt, new Date(query.dateFrom)));
  }
  if (query.dateTo) {
    conditions.push(lte(schema.auditLogs.createdAt, new Date(query.dateTo)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.limit;

  const rows = await db.query.auditLogs.findMany({
    where,
    orderBy: [desc(schema.auditLogs.createdAt)],
  query: { targetType?: string; targetId?: string; page: number; limit: number }
): Promise<{ logs: any[]; hasMore: boolean }> {
  const conditions: any[] = [];
  if (query.targetType) conditions.push(eq(schema.auditLog.targetType, query.targetType));
  if (query.targetId) conditions.push(eq(schema.auditLog.targetId, query.targetId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.limit;

  const rows = await db.query.auditLog.findMany({
    where,
    orderBy: [desc(schema.auditLog.createdAt)],
    limit: query.limit + 1,
    offset,
  });

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;

  // Resolve actor usernames
  const actorIds = Array.from(new Set(slice.map((r) => r.actorId).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const users = await db.query.users.findMany({
      where: inArray(schema.users.id, actorIds),
      columns: { id: true, username: true },
    });
    for (const u of users) nameById.set(u.id, u.username);
  }

  const logs = slice.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorName: nameById.get(r.actorId) ?? null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetUserId: r.targetUserId,
    circleId: r.circleId,
    details: r.details,
    createdAt: toISO(r.createdAt),
  const logs = slice.map((l) => ({
    id: l.id,
    actorId: l.actorId,
    action: l.action,
    targetType: l.targetType,
    targetId: l.targetId,
    metadata: l.metadata,
    createdAt: toISO(l.createdAt),
  }));

  return { logs, hasMore };
}
// Group detail
export async function adminGetGroup(
  db: DrizzleClient,
  id: string
): Promise<{
  group: Group;
  stats: { members: number; posts: number; comments: number; activity30d: number };
  members: any[];
  settings: any;
}> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, id),
  });
  if (!group) throw new Error('Group not found');

  const [memberCount] = await db
    .select({ count: count() })
    .from(schema.groupMemberships)
    .where(eq(schema.groupMemberships.groupId, id));

  const [postCount] = await db
    .select({ count: count() })
    .from(schema.posts)
    .where(and(eq(schema.posts.groupId, id), eq(schema.posts.status, 'published')));

  const [commentCount] = await db
    .select({ count: count() })
    .from(schema.comments)
    .innerJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
    .where(eq(schema.posts.groupId, id));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [activityCount] = await db
    .select({ count: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.groupId, id),
        gte(schema.posts.createdAt, thirtyDaysAgo)
      )
    );

  const members = await db
    .select({
      id: schema.groupMemberships.id,
      userId: schema.groupMemberships.userId,
      username: schema.users.username,
      userslug: schema.users.userslug,
      pictureUrl: schema.users.pictureUrl,
      role: schema.groupMemberships.role,
      reputationScore: schema.users.reputationScore,
      joinedAt: schema.groupMemberships.joinedAt,
    })
    .from(schema.groupMemberships)
    .innerJoin(schema.users, eq(schema.groupMemberships.userId, schema.users.id))
    .where(eq(schema.groupMemberships.groupId, id))
    .orderBy(desc(schema.groupMemberships.joinedAt));

  return {
    group: {
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
    },
    stats: {
      members: Number(memberCount.count),
      posts: Number(postCount.count),
      comments: Number(commentCount.count),
      activity30d: Number(activityCount.count),
    },
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.username,
      userslug: m.userslug,
      pictureUrl: m.pictureUrl,
      role: m.role,
      reputationScore: toNumber(m.reputationScore),
      joinedAt: toISO(m.joinedAt),
    })),
    settings: {
      postApproval: false,
    },
  };
}

export async function adminUpdateGroup(
  db: DrizzleClient,
  id: string,
  input: {
    name?: string;
    description?: string;
    color?: string;
    visibility?: string;
    requiredTierId?: string | null;
    postApproval?: boolean;
    icon?: string;
  }
): Promise<Group> {
  const existing = await db.query.groups.findFirst({
    where: eq(schema.groups.id, id),
  });
  if (!existing) throw new Error('Group not found');

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.color !== undefined) update.color = input.color;
  if (input.visibility !== undefined) update.visibility = input.visibility;
  if ('requiredTierId' in input) update.requiredTierId = input.requiredTierId;

  const [group] = await db
    .update(schema.groups)
    .set(update)
    .where(eq(schema.groups.id, id))
    .returning();

  if (!group) throw new Error('Failed to update group');

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

export async function adminDeleteGroup(
  db: DrizzleClient,
  id: string
): Promise<{ deleted: boolean; cascadeCounts?: { posts: number; members: number } }> {
  const existing = await db.query.groups.findFirst({
    where: eq(schema.groups.id, id),
  });
  if (!existing) throw new Error('Group not found');

  const [postCount] = await db
    .select({ count: count() })
    .from(schema.posts)
    .where(eq(schema.posts.groupId, id));

  const [memberCount] = await db
    .select({ count: count() })
    .from(schema.groupMemberships)
    .where(eq(schema.groupMemberships.groupId, id));

  const cascadeCounts = {
    posts: Number(postCount.count),
    members: Number(memberCount.count),
  };

  await db.delete(schema.groups).where(eq(schema.groups.id, id));

  return { deleted: true, cascadeCounts };
}

// User detail
export async function adminGetUser(
  db: DrizzleClient,
  id: string
): Promise<{
  user: any;
  activity: any[];
  badges: any[];
  memberships: any[];
  moderationHistory: any[];
}> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!user) throw new Error('User not found');

  const recentPosts = await db.query.posts.findMany({
    where: eq(schema.posts.authorId, id),
    orderBy: [desc(schema.posts.createdAt)],
    limit: 20,
    columns: {
      id: true,
      title: true,
      slug: true,
      type: true,
      status: true,
      groupId: true,
      createdAt: true,
    },
  });

  const recentComments = await db.query.comments.findMany({
    where: eq(schema.comments.authorId, id),
    orderBy: [desc(schema.comments.createdAt)],
    limit: 20,
    columns: {
      id: true,
      content: true,
      postId: true,
      createdAt: true,
    },
  });

  const userBadges = await db
    .select({
      id: schema.userBadges.id,
      badgeId: schema.userBadges.badgeId,
      slug: schema.badges.slug,
      name: schema.badges.name,
      description: schema.badges.description,
      iconUrl: schema.badges.iconUrl,
      awardedAt: schema.userBadges.awardedAt,
    })
    .from(schema.userBadges)
    .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
    .where(eq(schema.userBadges.userId, id))
    .orderBy(desc(schema.userBadges.awardedAt));

  const memberships = await db
    .select({
      id: schema.groupMemberships.id,
      groupId: schema.groupMemberships.groupId,
      groupSlug: schema.groups.slug,
      groupName: schema.groups.name,
      groupColor: schema.groups.color,
      role: schema.groupMemberships.role,
      joinedAt: schema.groupMemberships.joinedAt,
    })
    .from(schema.groupMemberships)
    .innerJoin(schema.groups, eq(schema.groupMemberships.groupId, schema.groups.id))
    .where(eq(schema.groupMemberships.userId, id))
    .orderBy(desc(schema.groupMemberships.joinedAt));

  const flags = await db.query.flags.findMany({
    where: and(
      eq(schema.flags.targetType, 'post' as any),
      eq(schema.flags.targetId, id)
    ),
    orderBy: [desc(schema.flags.createdAt)],
    limit: 20,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      userslug: user.userslug,
      fullName: user.fullName,
      pictureUrl: user.pictureUrl,
      aboutMe: user.aboutMe,
      role: user.role,
      reputationScore: toNumber(user.reputationScore),
      streakDays: user.streakDays,
      lastActiveAt: toISO(user.lastActiveAt),
      createdAt: toISO(user.createdAt),
    },
    activity: [
      ...recentPosts.map((p) => ({
        type: 'post' as const,
        id: p.id,
        title: p.title,
        slug: p.slug,
        groupId: p.groupId,
        status: p.status,
        createdAt: toISO(p.createdAt),
      })),
      ...recentComments.map((c) => ({
        type: 'comment' as const,
        id: c.id,
        content: c.content.slice(0, 200),
        postId: c.postId,
        createdAt: toISO(c.createdAt),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    badges: userBadges.map((ub) => ({
      id: ub.id,
      badgeId: ub.badgeId,
      slug: ub.slug,
      name: ub.name,
      description: ub.description,
      iconUrl: ub.iconUrl,
      awardedAt: toISO(ub.awardedAt),
    })),
    memberships: memberships.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      groupSlug: m.groupSlug,
      groupName: m.groupName,
      groupColor: m.groupColor,
      role: m.role,
      joinedAt: toISO(m.joinedAt),
    })),
    moderationHistory: flags.map((f) => ({
      id: f.id,
      reason: f.reason,
      status: f.status,
      autoFlagged: f.autoFlagged,
      createdAt: toISO(f.createdAt),
    })),
  };
}

export async function adminDeleteUser(
  db: DrizzleClient,
  id: string
): Promise<{ deleted: boolean }> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!existing) throw new Error('User not found');

  // Anonymize user data (GDPR)
  const anonymizedEmail = `deleted-${id.slice(0, 8)}@anonymized.pm`;
  await db
    .update(schema.users)
    .set({
      email: anonymizedEmail,
      username: `deleted-${id.slice(0, 8)}`,
      userslug: `deleted-${id.slice(0, 8)}`,
      fullName: null,
      pictureUrl: null,
      aboutMe: null,
      painfulToolStackTask: '',
      role: 'member',
      reputationScore: '0',
      streakDays: 0,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id));

  return { deleted: true };
}

// Invites
export async function adminListInvites(
  db: DrizzleClient,
  query: { circleId?: string; status?: string; page: number; limit: number }
): Promise<{ invites: any[]; hasMore: boolean }> {
  const conditions: any[] = [];
  if (query.circleId) conditions.push(eq(schema.groupInvites.groupId, query.circleId));
  if (query.status === 'active') {
    conditions.push(
      or(
        isNull(schema.groupInvites.expiresAt),
        gte(schema.groupInvites.expiresAt, new Date())
      )
    );
  } else if (query.status === 'expired') {
    conditions.push(
      and(
        sql`${schema.groupInvites.expiresAt} IS NOT NULL`,
        lte(schema.groupInvites.expiresAt, new Date())
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.limit;

  const rows = await db
    .select({
      id: schema.groupInvites.id,
      groupId: schema.groupInvites.groupId,
      groupSlug: schema.groups.slug,
      groupName: schema.groups.name,
      code: schema.groupInvites.code,
      inviterId: schema.groupInvites.inviterId,
      maxUses: schema.groupInvites.maxUses,
      usedCount: schema.groupInvites.usedCount,
      expiresAt: schema.groupInvites.expiresAt,
      role: schema.groupInvites.role,
      createdAt: schema.groupInvites.createdAt,
    })
    .from(schema.groupInvites)
    .innerJoin(schema.groups, eq(schema.groupInvites.groupId, schema.groups.id))
    .where(where ?? sql`TRUE`)
    .orderBy(desc(schema.groupInvites.createdAt))
    .limit(query.limit + 1)
    .offset(offset);

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;

  const invites = slice.map((i) => ({
    id: i.id,
    groupId: i.groupId,
    groupSlug: i.groupSlug,
    groupName: i.groupName,
    code: i.code,
    inviterId: i.inviterId,
    maxUses: i.maxUses,
    usedCount: i.usedCount,
    expiresAt: i.expiresAt ? toISO(i.expiresAt) : null,
    role: i.role,
    createdAt: toISO(i.createdAt),
  }));

  return { invites, hasMore };
}

export async function adminCreateInvite(
  db: DrizzleClient,
  input: {
    groupId: string;
    maxUses: number;
    expiresAt?: string;
    role: string;
    inviterId: string;
  }
): Promise<any> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, input.groupId),
  });
  if (!group) throw new Error('Group not found');

  const code = generateInviteCode();

  const [invite] = await db
    .insert(schema.groupInvites)
    .values({
      groupId: input.groupId,
      code,
      inviterId: input.inviterId,
      maxUses: input.maxUses,
      usedCount: 0,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      role: input.role as any,
    })
    .returning();

  if (!invite) throw new Error('Failed to create invite');

  return {
    id: invite.id,
    groupId: invite.groupId,
    code: invite.code,
    inviterId: invite.inviterId,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt ? toISO(invite.expiresAt) : null,
    role: invite.role,
    createdAt: toISO(invite.createdAt),
  };
}

export async function adminRevokeInvite(
  db: DrizzleClient,
  id: string
): Promise<void> {
  const existing = await db.query.groupInvites.findFirst({
    where: eq(schema.groupInvites.id, id),
  });
  if (!existing) throw new Error('Invite not found');

  await db
    .update(schema.groupInvites)
    .set({ expiresAt: new Date(0), updatedAt: new Date() })
    .where(eq(schema.groupInvites.id, id));
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
