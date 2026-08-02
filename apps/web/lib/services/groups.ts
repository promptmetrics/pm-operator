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

    const [row] = await tx
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

    if (!row) throw new Error('Already a member of this group');

    return row;
  });

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

  await db
    .delete(schema.groupMemberships)
    .where(
      and(
        eq(schema.groupMemberships.groupId, group.id),
        eq(schema.groupMemberships.userId, userId)
      )
    );
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

  await db
    .delete(schema.groupMemberships)
    .where(
      and(
        eq(schema.groupMemberships.groupId, group.id),
        eq(schema.groupMemberships.userId, targetUserId)
      )
    );
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
