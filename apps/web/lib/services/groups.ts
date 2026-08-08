import { eq, and, or, sql, inArray, isNull, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Group,
  GroupMember,
  GroupMembership,
  GroupInvite,
  GroupStats,
  CreateGroupRequest,
  CreateInviteRequest,
  JoinGroupRequest,
} from '@pm-operator/api';
import { POINT_WEIGHTS } from '@pm-operator/api';
import { toISO, isAdminOrModerator, toNumber } from './shared';
import { awardPoints } from './points';
import { postVisibilityFilter } from './posts';
import { sendTransactional } from '../email';

// Visibility filter mirrored from RLS: public groups, groups the current user
// belongs to, or groups created by the current user. Admins bypass visibility.
function groupVisibilityFilter(currentUserId: string | undefined) {
  const publicFilter = eq(schema.groups.visibility, 'public');
  if (!currentUserId) return publicFilter;
  return or(
    publicFilter,
    eq(schema.groups.createdBy, currentUserId),
    sql`exists (
      select 1 from ${schema.groupMemberships}
      where ${schema.groupMemberships.groupId} = ${schema.groups.id}
        and ${schema.groupMemberships.userId} = ${currentUserId}
    )`
  );
}

async function isGroupAdminOrModerator(
  db: DrizzleClient,
  groupId: string,
  userId: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  if (user?.role === 'admin') return true;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, groupId),
      eq(schema.groupMemberships.userId, userId)
    ),
    columns: { role: true },
  });
  return membership?.role === 'admin' || membership?.role === 'moderator';
}

export async function listGroups(
  db: DrizzleClient,
  currentUserId?: string
): Promise<Group[]> {
  const rows = await db.query.groups.findMany({
    where: groupVisibilityFilter(currentUserId),
    orderBy: [schema.groups.createdAt],
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

export async function getGroupBySlug(
  db: DrizzleClient,
  slug: string,
  currentUserId?: string
): Promise<Group | null> {
  const row = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!row) return null;

  // Re-apply visibility check manually because service-role bypasses RLS.
  if (row.visibility !== 'public' && !currentUserId) return null;
  if (
    row.visibility !== 'public' &&
    row.createdBy !== currentUserId &&
    !(await db.query.groupMemberships.findFirst({
      where: and(
        eq(schema.groupMemberships.groupId, row.id),
        eq(schema.groupMemberships.userId, currentUserId!)
      ),
    }))
  ) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    visibility: row.visibility,
    requiredTierId: row.requiredTierId,
    memberCount: row.memberCount,
    createdBy: row.createdBy,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
  };
}

// Circle-page banner aggregates (WS6/T6.1). Counts are viewer-visibility-
// dependent (same postVisibilityFilter as listGroupsWithPostCounts): absolute
// counts would leak activity volume in groups the viewer can't see into.
// memberCount and createdAt come from the group row itself — not recounted.
export async function getGroupStats(
  db: DrizzleClient,
  groupId: string,
  currentUserId?: string
): Promise<GroupStats> {
  const [row] = await db
    .select({
      postsThisMonth: sql<number>`count(*) filter (
        where ${schema.posts.createdAt} >= date_trunc('month', now())
      )::int`,
      questions: sql<number>`count(*) filter (
        where ${schema.posts.type} = 'question'
      )::int`,
      solved: sql<number>`count(*) filter (
        where ${schema.posts.type} = 'question'
          and ${schema.posts.acceptedCommentId} is not null
      )::int`,
    })
    .from(schema.posts)
    // postVisibilityFilter references groups.visibility, so the group row
    // must be in scope (1:1 join — does not change the aggregates).
    .innerJoin(schema.groups, eq(schema.groups.id, schema.posts.groupId))
    .where(and(eq(schema.posts.groupId, groupId), postVisibilityFilter(currentUserId)));

  const questions = toNumber(row?.questions ?? 0);
  return {
    postsThisMonth: toNumber(row?.postsThisMonth ?? 0),
    solvedRate: questions > 0 ? toNumber(row?.solved ?? 0) / questions : null,
  };
}

// Track 2C: per-group aggregates for the groups LIST (includeStats=1 on
// GET /api/v1/groups). One query over all groups' posts, keyed by group id.
// Deliberately viewer-INDEPENDENT (published posts only, no
// postVisibilityFilter) so the route can wrap it in unstable_cache and share
// one 300 s entry across every viewer — caching a viewer-dependent aggregate
// would either leak or fragment the cache. The list route only attaches stats
// to groups the viewer's own base query returned, so nothing leaks about
// invisible groups.
export type GroupStatsMap = Record<string, GroupStats>;

export async function listGroupStats(db: DrizzleClient): Promise<GroupStatsMap> {
  const rows = await db
    .select({
      groupId: schema.posts.groupId,
      postsThisMonth: sql<number>`count(*) filter (
        where ${schema.posts.createdAt} >= now() - interval '30 days'
      )::int`,
      questions: sql<number>`count(*) filter (
        where ${schema.posts.type} = 'question'
      )::int`,
      solved: sql<number>`count(*) filter (
        where ${schema.posts.type} = 'question'
          and ${schema.posts.acceptedCommentId} is not null
      )::int`,
    })
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .groupBy(schema.posts.groupId);

  const map: GroupStatsMap = {};
  for (const row of rows) {
    const questions = toNumber(row.questions);
    map[row.groupId] = {
      postsThisMonth: toNumber(row.postsThisMonth),
      solvedRate: questions > 0 ? toNumber(row.solved) / questions : null,
    };
  }
  return map;
}

export async function createGroup(
  db: DrizzleClient,
  input: CreateGroupRequest,
  createdById: string
): Promise<Group> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, createdById),
    columns: { role: true },
  });
  if (!user || !isAdminOrModerator(user.role)) {
    throw new Error('Forbidden');
  }

  const group = await db.transaction(async (tx) => {
    const [created] = await tx
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

    if (!created) throw new Error('Failed to create group');

    await tx.insert(schema.groupMemberships).values({
      groupId: created.id,
      userId: createdById,
      role: 'admin',
    });

    return created;
  });

  const refreshed = await db.query.groups.findFirst({
    where: eq(schema.groups.id, group.id),
  });

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    color: group.color,
    visibility: group.visibility,
    requiredTierId: group.requiredTierId,
    memberCount: refreshed?.memberCount ?? group.memberCount,
    createdBy: group.createdBy,
    createdAt: toISO(group.createdAt),
    updatedAt: toISO(group.updatedAt),
  };
}

export async function updateGroup(
  db: DrizzleClient,
  slug: string,
  input: Partial<CreateGroupRequest>,
  currentUserId: string
): Promise<Group> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) throw new Error('Group not found');

  const canEdit = await isGroupAdminOrModerator(db, group.id, currentUserId);
  if (!canEdit) throw new Error('Forbidden');

  const update: Partial<typeof schema.groups.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.color !== undefined) update.color = input.color;
  if (input.visibility !== undefined) update.visibility = input.visibility;
  if (input.requiredTierId !== undefined) update.requiredTierId = input.requiredTierId;

  const [updated] = await db
    .update(schema.groups)
    .set(update)
    .where(eq(schema.groups.id, group.id))
    .returning();

  if (!updated) throw new Error('Failed to update group');

  return {
    id: updated.id,
    slug: updated.slug,
    name: updated.name,
    description: updated.description,
    color: updated.color,
    visibility: updated.visibility,
    requiredTierId: updated.requiredTierId,
    memberCount: updated.memberCount,
    createdBy: updated.createdBy,
    createdAt: toISO(updated.createdAt),
    updatedAt: toISO(updated.updatedAt),
  };
}

export async function joinGroup(
  db: DrizzleClient,
  slug: string,
  userId: string,
  request: JoinGroupRequest
): Promise<GroupMembership> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) throw new Error('Group not found');

  if (group.visibility === 'paid') {
    throw new Error('Paid circles are not enabled at launch');
  }

  let assignedRole: 'member' | 'moderator' | 'admin' = 'member';
  let inviteId: string | undefined;

  if (group.visibility === 'invite_only') {
    if (!request.inviteCode) throw new Error('Invite code required');
    const invite = await db.query.groupInvites.findFirst({
      where: eq(schema.groupInvites.code, request.inviteCode),
    });
    if (!invite || invite.groupId !== group.id) throw new Error('Invalid invite code');
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new Error('Invite code expired');
    }
    if (invite.usedCount >= invite.maxUses) {
      throw new Error('Invite code fully redeemed');
    }
    assignedRole = invite.role;
    inviteId = invite.id;
  }

  const membership = await db.transaction(async (tx) => {
    if (inviteId) {
      const [updatedInvite] = await tx
        .update(schema.groupInvites)
        .set({
          usedCount: sql`${schema.groupInvites.usedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.groupInvites.id, inviteId),
            sql`${schema.groupInvites.usedCount} < ${schema.groupInvites.maxUses}`
          )
        )
        .returning();

      if (!updatedInvite) throw new Error('Invite code fully redeemed');
    }

    const [inserted] = await tx
      .insert(schema.groupMemberships)
      .values({
        groupId: group.id,
        userId,
        role: assignedRole,
      })
      .onConflictDoNothing({
        target: [schema.groupMemberships.groupId, schema.groupMemberships.userId],
      })
      .returning();

    if (inserted) {
      // New member: keep the denormalized count in sync. Do this inside the
      // same transaction so a membership row never exists without the count.
      await tx
        .update(schema.groups)
        .set({
          memberCount: sql`${schema.groups.memberCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.groups.id, group.id));
    }

    // Idempotent: if the user is already a member (e.g. they joined during
    // onboarding and the page still shows "Join circle"), return the existing
    // membership instead of throwing.
    return (
      inserted ??
      (await tx.query.groupMemberships.findFirst({
        where: and(
          eq(schema.groupMemberships.groupId, group.id),
          eq(schema.groupMemberships.userId, userId)
        ),
      }))
    );
  });

  if (!membership) {
    throw new Error('Failed to join circle');
  }

  return {
    id: membership.id,
    groupId: membership.groupId,
    userId: membership.userId,
    role: membership.role,
    joinedAt: toISO(membership.joinedAt),
    createdAt: toISO(membership.createdAt),
    updatedAt: toISO(membership.updatedAt),
  };
}

async function countGroupAdmins(db: DrizzleClient, groupId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(schema.groupMemberships)
    .where(
      and(
        eq(schema.groupMemberships.groupId, groupId),
        eq(schema.groupMemberships.role, 'admin')
      )
    );
  return Number(result[0]?.count ?? 0);
}

export async function leaveGroup(
  db: DrizzleClient,
  slug: string,
  userId: string
): Promise<void> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) throw new Error('Group not found');

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, group.id),
      eq(schema.groupMemberships.userId, userId)
    ),
  });
  if (!membership) throw new Error('Membership not found');

  if (membership.role === 'admin') {
    const admins = await countGroupAdmins(db, group.id);
    if (admins <= 1) {
      throw new Error('Cannot remove the last admin from a group');
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.groupMemberships)
      .where(
        and(
          eq(schema.groupMemberships.groupId, group.id),
          eq(schema.groupMemberships.userId, userId)
        )
      );

    await tx
      .update(schema.groups)
      .set({
        memberCount: sql`greatest(${schema.groups.memberCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(schema.groups.id, group.id));
  });
}

export async function removeMember(
  db: DrizzleClient,
  slug: string,
  targetUserId: string,
  currentUserId: string
): Promise<void> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) throw new Error('Group not found');

  const canRemove = await isGroupAdminOrModerator(db, group.id, currentUserId);
  if (!canRemove) throw new Error('Forbidden');

  const targetMembership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, group.id),
      eq(schema.groupMemberships.userId, targetUserId)
    ),
  });
  if (!targetMembership) throw new Error('Membership not found');

  if (targetMembership.role === 'admin') {
    const admins = await countGroupAdmins(db, group.id);
    if (admins <= 1) {
      throw new Error('Cannot remove the last admin from a group');
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.groupMemberships)
      .where(
        and(
          eq(schema.groupMemberships.groupId, group.id),
          eq(schema.groupMemberships.userId, targetUserId)
        )
      );

    await tx
      .update(schema.groups)
      .set({
        memberCount: sql`greatest(${schema.groups.memberCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(schema.groups.id, group.id));
  });
}

export async function listGroupMembers(
  db: DrizzleClient,
  slug: string,
  currentUserId?: string
): Promise<GroupMember[]> {
  const group = await getGroupBySlug(db, slug, currentUserId);
  if (!group) throw new Error('Group not found');

  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      userslug: schema.users.userslug,
      pictureUrl: schema.users.pictureUrl,
      role: schema.groupMemberships.role,
      reputationScore: schema.users.reputationScore,
      joinedAt: schema.groupMemberships.joinedAt,
    })
    .from(schema.groupMemberships)
    .innerJoin(schema.users, eq(schema.groupMemberships.userId, schema.users.id))
    .where(eq(schema.groupMemberships.groupId, group.id))
    .orderBy(schema.groupMemberships.joinedAt);

  return rows.map((m) => ({
    id: m.id,
    username: m.username,
    userslug: m.userslug,
    pictureUrl: m.pictureUrl,
    role: m.role,
    reputationScore: toNumber(m.reputationScore),
    joinedAt: toISO(m.joinedAt),
  }));
}

export async function createInvite(
  db: DrizzleClient,
  slug: string,
  input: CreateInviteRequest,
  inviterId: string
): Promise<GroupInvite> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, slug),
  });
  if (!group) throw new Error('Group not found');

  const canInvite = await isGroupAdminOrModerator(db, group.id, inviterId);
  if (!canInvite) throw new Error('Forbidden');

  const [invite] = await db
    .insert(schema.groupInvites)
    .values({
      groupId: group.id,
      inviterId,
      role: input.role,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      code: input.groupSlug + '-' + crypto.randomUUID(),
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
    updatedAt: toISO(invite.updatedAt),
  };
}

export async function acceptInvite(
  db: DrizzleClient,
  code: string,
  userId: string
): Promise<GroupMembership> {
  const invite = await db.query.groupInvites.findFirst({
    where: eq(schema.groupInvites.code, code),
  });
  if (!invite) throw new Error('Invite not found');
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw new Error('Invite code expired');
  }
  if (invite.usedCount >= invite.maxUses) {
    throw new Error('Invite code fully redeemed');
  }

  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, invite.groupId),
  });
  if (!group) throw new Error('Group not found');

  const membership = await db.transaction(async (tx) => {
    const [updatedInvite] = await tx
      .update(schema.groupInvites)
      .set({
        usedCount: sql`${schema.groupInvites.usedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.groupInvites.id, invite.id),
          sql`${schema.groupInvites.usedCount} < ${schema.groupInvites.maxUses}`
        )
      )
      .returning();

    if (!updatedInvite) throw new Error('Invite code fully redeemed');

    const [row] = await tx
      .insert(schema.groupMemberships)
      .values({
        groupId: group.id,
        userId,
        role: invite.role,
      })
      .onConflictDoNothing({
        target: [schema.groupMemberships.groupId, schema.groupMemberships.userId],
      })
      .returning();

    if (!row) throw new Error('Already a member of this group');

    return row;
  });

  // PRD INVITE-3: the inviter earns points once per invite (idempotent via
  // the (user, event_type, source_id) unique key on point_events).
  if (invite.inviterId && invite.inviterId !== userId) {
    await awardPoints(db, {
      userId: invite.inviterId,
      eventType: 'invite_accepted',
      points: POINT_WEIGHTS.invite_accepted,
      sourceId: invite.id,
      groupId: group.id,
      context: { acceptedBy: userId },
    });

    // T8.4: email the inviter that their invite was accepted. Same guard as
    // the points award (inviter exists and isn't the acceptor). Fire-and-forget
    // — sendTransactional honors emailNotifications (default on) and never
    // throws, so a Loops outage can't break invite acceptance.
    await sendTransactional('invite_accepted', {
      db,
      userId: invite.inviterId,
      dataVariables: {
        circleName: group.name,
        circleUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/g/${group.slug}`,
      },
    });
  }

  return {
    id: membership.id,
    groupId: membership.groupId,
    userId: membership.userId,
    role: membership.role,
    joinedAt: toISO(membership.joinedAt),
    createdAt: toISO(membership.createdAt),
    updatedAt: toISO(membership.updatedAt),
  };
}

// T8.9 (spec §5.5/521): read-side resolution for the /invite/[code] redemption
// page. Sequential (≤1 concurrent): invite → group → membership. Returns only
// what the page needs to render a state (valid / expired / fully-redeemed /
// already-member), never the member list or posts.
export interface InviteRedemption {
  code: string;
  group: {
    slug: string;
    name: string;
    color: string | null;
    description: string | null;
    memberCount: number;
  };
  role: string;
  expired: boolean;
  fullyRedeemed: boolean;
  alreadyMember: boolean;
}

export async function getInviteForRedemption(
  db: DrizzleClient,
  code: string,
  userId?: string
): Promise<InviteRedemption | null> {
  const invite = await db.query.groupInvites.findFirst({
    where: eq(schema.groupInvites.code, code),
  });
  if (!invite) return null;

  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, invite.groupId),
    columns: {
      id: true,
      slug: true,
      name: true,
      color: true,
      description: true,
      memberCount: true,
    },
  });
  if (!group) return null;

  const expired = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
  const fullyRedeemed = invite.usedCount >= invite.maxUses;

  let alreadyMember = false;
  if (userId) {
    const membership = await db.query.groupMemberships.findFirst({
      where: and(
        eq(schema.groupMemberships.groupId, group.id),
        eq(schema.groupMemberships.userId, userId)
      ),
    });
    alreadyMember = !!membership;
  }

  return {
    code: invite.code,
    group: {
      slug: group.slug,
      name: group.name,
      color: group.color,
      description: group.description,
      memberCount: group.memberCount,
    },
    role: invite.role,
    expired,
    fullyRedeemed,
    alreadyMember,
  };
}

// T8.9 (spec §5.5/522): logged-in non-members of an invite-only circle see a
// gated preview (lock + description + invite-code entry) instead of a 404.
// Returns metadata only — never posts/members/leaderboard — and only for
// invite-only circles (paid/private stay hidden at launch). Bounded: 1 query.
export interface InviteOnlyPreview {
  slug: string;
  name: string;
  color: string | null;
  description: string | null;
  memberCount: number;
}

export async function getGroupPreviewForInviteOnly(
  db: DrizzleClient,
  slug: string
): Promise<InviteOnlyPreview | null> {
  const row = await db.query.groups.findFirst({
    where: and(eq(schema.groups.slug, slug), eq(schema.groups.visibility, 'invite_only')),
    columns: {
      slug: true,
      name: true,
      color: true,
      description: true,
      memberCount: true,
    },
  });
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    color: row.color,
    description: row.description,
    memberCount: row.memberCount,
  };
}

export interface RecommendedCircle {
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  memberCount: number;
}

// Expands the fixed Step-1 stack options (see onboarding-form STACK_OPTIONS)
// into the loose keywords that actually appear in circle names/descriptions, so
// a tag like "Vercel" matches a circle called "Vercel AI SDK" and "Evals"
// matches "eval"/"evaluation". Custom free-text tags fall back to a plain
// substring match against the lowercased name+description.
const STACK_KEYWORD_ALIASES: Record<string, string[]> = {
  mcp: ['mcp', 'model context protocol', 'tool'],
  'next.js': ['next', 'next.js', 'react'],
  vercel: ['vercel', 'ai sdk', 'ai gateway', 'edge'],
  langchain: ['langchain', 'agent', 'rag', 'llm'],
  openai: ['openai', 'gpt', 'prompt', 'llm'],
  authentication: ['auth', 'oauth', 'session', 'supabase'],
  evals: ['eval', 'evaluation', 'quality'],
  'multi-agent orchestration': ['agent', 'agents', 'orchestration', 'workflow'],
  governance: ['governance', 'policy', 'compliance', 'guardrail', 'moderation'],
  storage: ['storage', 'vector', 'cache', 'database'],
  supabase: ['supabase', 'auth', 'postgres', 'rls'],
  postgres: ['postgres', 'sql', 'database', 'query'],
  redis: ['redis', 'cache', 'queue'],
  observability: ['observability', 'telemetry', 'trace', 'monitor', 'metrics'],
  testing: ['test', 'testing', 'eval', 'quality', 'ci'],
};

// T8.10 (spec §3.2/105-169): Step-2 circle recommendations. One bounded query
// (public circles only) scored in JS by stack-keyword overlap, then by
// popularity so an empty/blank stack still surfaces joinable circles. No
// Promise.all, no multi-CTE — pool-safe (1 concurrent query).
export async function listRecommendedCircles(
  db: DrizzleClient,
  keywords: string[],
  limit = 12
): Promise<RecommendedCircle[]> {
  const rows = await db.query.groups.findMany({
    where: eq(schema.groups.visibility, 'public'),
    columns: {
      slug: true,
      name: true,
      description: true,
      color: true,
      memberCount: true,
    },
  });

  const kws = new Set<string>();
  for (const raw of keywords) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    kws.add(key);
    const aliases = STACK_KEYWORD_ALIASES[key];
    if (aliases) for (const a of aliases) kws.add(a);
  }

  const scored = rows.map((row) => {
    const hay = `${row.name} ${row.description ?? ''}`.toLowerCase();
    let score = 0;
    if (kws.size > 0) {
      for (const kw of kws) {
        if (hay.includes(kw)) score += 1;
      }
    }
    return { ...row, score };
  });

  scored.sort((a, b) => b.score - a.score || b.memberCount - a.memberCount);
  return scored.slice(0, limit).map(({ slug, name, description, color, memberCount }) => ({
    slug,
    name,
    description,
    color,
    memberCount,
  }));
}
