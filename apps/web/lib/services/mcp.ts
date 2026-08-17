import 'server-only';

import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { POINT_WEIGHTS, type SearchQuery, type CreateBadgeRequest } from '@pm-operator/api';
import type {
  McpToolServices,
  McpResourceServices,
  McpContext,
  SearchPostsInput,
  GetUserProfileInput,
  ListLeaderboardsInput,
  SummarizeThreadInput,
  CreatePostInput,
  UpdatePostInput,
  DeletePostInput,
  CreateCommentInput,
  UpdateCommentInput,
  DeleteCommentInput,
  AcceptSolutionInput,
  ToggleReactionInput,
  ToggleBookmarkInput,
  FollowUserInput,
  UnfollowUserInput,
  JoinCircleInput,
  LeaveCircleInput,
  AdminListUsersInput,
  AdminGetUserInput,
  AdminSetUserRoleInput,
  AdminDeleteUserInput,
  AdminCreateGroupInput,
  AdminUpdateGroupInput,
  AdminDeleteGroupInput,
  AdminUpdateSettingsInput,
  AdminAwardPointsInput,
  AdminCreateBadgeInput,
  AdminAwardBadgeInput,
  AdminCreateWatchedPhraseInput,
  AdminDeleteWatchedPhraseInput,
  AdminResolveFlagInput,
  AdminDeleteFlagInput,
  AdminListAuditLogsInput,
  AdminRevokeMcpClientInput,
} from '@pm-operator/mcp';
import { checkRateLimit } from '../rate-limit';
import { searchPosts as searchPostsService } from './search';
import { getUserProfile as getUserProfileService } from './users';
import {
  getGroupBySlug,
  joinGroup as joinGroupService,
  leaveGroup as leaveGroupService,
} from './groups';
import { listGlobalLeaderboard, listGroupLeaderboard } from './community';
import {
  getPostById,
  createPost as createPostService,
  updatePost as updatePostService,
  deletePost as deletePostService,
} from './posts';
import {
  listCommentsForPost,
  createComment as createCommentService,
  updateComment as updateCommentService,
  deleteComment as deleteCommentService,
  acceptSolution as acceptSolutionService,
} from './comments';
import { toggleReaction as toggleReactionService } from './reactions';
import { toggleBookmark as toggleBookmarkService } from './bookmarks';
import {
  followUser as followUserService,
  unfollowUser as unfollowUserService,
} from './follows';
import {
  resolveFlag as resolveFlagService,
  deleteFlag as deleteFlagService,
} from './moderation';
import { awardPoints as awardPointsService, advanceStreak as advanceStreakService } from './points';
import {
  requireGlobalAdmin,
  adminCreateAuditLog,
  adminListUsers as adminListUsersService,
  adminGetUser as adminGetUserService,
  adminSetUserRole as adminSetUserRoleService,
  adminDeleteUser as adminDeleteUserService,
  adminListGroups as adminListGroupsService,
  adminCreateGroup as adminCreateGroupService,
  adminUpdateGroup as adminUpdateGroupService,
  adminDeleteGroup as adminDeleteGroupService,
  adminUpdateSettings as adminUpdateSettingsService,
  adminAwardPoints as adminAwardPointsService,
  adminListBadges as adminListBadgesService,
  adminCreateBadge as adminCreateBadgeService,
  adminAwardBadge as adminAwardBadgeService,
  adminListWatchedPhrases as adminListWatchedPhrasesService,
  adminCreateWatchedPhrase as adminCreateWatchedPhraseService,
  adminDeleteWatchedPhrase as adminDeleteWatchedPhraseService,
  adminListAuditLogs as adminListAuditLogsService,
  adminListMcpClients as adminListMcpClientsService,
  adminRevokeMcpClient as adminRevokeMcpClientService,
} from './admin';

type McpServices = McpToolServices & McpResourceServices;

// adminCreateAuditLog's input — its `action`/`targetType` are enum-typed, so
// passing the literals below is compile-checked against auditLogActionEnum /
// auditTargetTypeEnum.
type AuditInput = Parameters<typeof adminCreateAuditLog>[1];

const READ_TOOL_SAMPLE_RATE = 0.1;

interface AgentActionInput {
  clientId: string;
  userId?: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string | null;
  durationMs?: number;
}

export function createMcpServices(db: DrizzleClient, logger: Logger): McpServices {
  return {
    // --- community:read (existing) ---
    searchPosts: wrapReadTool('search_posts', async (input, _ctx) => {
      const query: SearchQuery = {
        q: input.query,
        groupSlug: input.group_slug,
        tags: input.tags,
        sort: input.sort,
        page: input.page,
        limit: input.limit,
      };
      return searchPostsService(db, query);
    }),

    getUserProfile: wrapReadTool('get_user_profile', async (input, _ctx) => {
      return getUserProfileService(db, input.user_slug);
    }),

    getUserProfileBySlug: wrapReadResource('user_profile', async (slug, _ctx) => {
      return getUserProfileService(db, slug);
    }),

    listLeaderboards: wrapReadTool('list_leaderboards', async (input, _ctx) => {
      const period = toServicePeriod(input.period);
      const limit = input.limit;

      if (input.type === 'all-time') {
        return {
          type: input.type,
          period: input.period,
          entries: await listGlobalLeaderboard(db, period, limit),
        };
      }

      const group = await getGroupBySlug(db, input.type);
      if (!group) {
        return {
          type: input.type,
          period: input.period,
          entries: [],
        };
      }

      return {
        type: input.type,
        period: input.period,
        groupSlug: group.slug,
        entries: await listGroupLeaderboard(db, group.id, period, limit),
      };
    }),

    summarizeThread: wrapReadTool('summarize_thread', async (input, _ctx) => {
      const post = await getPostById(db, input.post_id);
      if (!post) {
        throw new Error('Post not found');
      }

      const comments = await listCommentsForPost(db, input.post_id);
      const lines = [
        post.title,
        post.contentPlain,
        ...flattenComments(comments).map((c) => c.contentPlain),
      ].filter(Boolean);
      const joined = lines.join('\n\n');
      const summary =
        joined.length > input.max_length
          ? joined.slice(0, input.max_length).replace(/\s+\S*$/, '') + '...'
          : joined;

      return {
        post_id: post.id,
        title: post.title,
        summary,
        comment_count: comments.length,
        max_length: input.max_length,
      };
    }),

    getGroupBySlug: wrapReadResource('group', async (slug, _ctx, _query) => {
      return getGroupBySlug(db, slug);
    }),

    getPostById: wrapReadResource('post', async (id, _ctx, _query) => {
      return getPostById(db, id);
    }),

    getLeaderboard: wrapReadResource(
      'leaderboard',
      async (type, _ctx, query) => {
        const { period: requestedPeriod, groupSlug } = query ?? {};
        const period = toServicePeriod(requestedPeriod ?? 'all_time');
        const limit = 20;

        if (type === 'all-time') {
          return {
            type,
            period: requestedPeriod,
            groupSlug,
            entries: await listGlobalLeaderboard(db, period, limit),
          };
        }

        const group = await getGroupBySlug(db, type);
        if (!group) {
          return {
            type,
            period: requestedPeriod,
            groupSlug,
            entries: [],
          };
        }

        return {
          type,
          period: requestedPeriod,
          groupSlug: group.slug,
          entries: await listGroupLeaderboard(db, group.id, period, limit),
        };
      }
    ),

    // --- community:write (act as the bound user; logged every call) ---

    createPost: wrapWriteTool('create_post', async (input, ctx) => {
      // createPost itself does NOT award points or advance the streak — the
      // web post route does, after the service call. Replicate that here so
      // MCP-authored posts count toward reputation and streaks exactly like
      // web ones.
      const post = await createPostService(db, {
        groupSlug: input.group_slug,
        title: input.title,
        content: input.content,
        type: input.type,
        tags: input.tags,
        coverImageUrl: input.cover_image_url,
      }, ctx.userId!);

      await awardPointsService(db, {
        userId: ctx.userId!,
        eventType: 'topic_created',
        points: POINT_WEIGHTS.topic_created,
        sourceId: post.id,
        groupId: post.groupId,
        context: { title: post.title },
      });
      await advanceStreakService(db, ctx.userId!);

      return post;
    }),

    updatePost: wrapWriteTool('update_post', async (input, ctx) => {
      return updatePostService(db, input.post_id, {
        title: input.title,
        content: input.content,
        type: input.type,
        tags: input.tags,
        status: input.status,
        coverImageUrl: input.cover_image_url,
        featuredLabel: input.featured_label,
      }, ctx.userId!);
    }),

    deletePost: wrapWriteTool('delete_post', async (input, ctx) => {
      return deletePostService(db, input.post_id, ctx.userId!);
    }),

    createComment: wrapWriteTool('create_comment', async (input, ctx) => {
      return createCommentService(db, input.post_id, {
        content: input.content,
        parentCommentId: input.parent_comment_id,
      }, ctx.userId!);
    }),

    updateComment: wrapWriteTool('update_comment', async (input, ctx) => {
      return updateCommentService(db, input.comment_id, {
        content: input.content,
        status: input.status,
      }, ctx.userId!);
    }),

    deleteComment: wrapWriteTool('delete_comment', async (input, ctx) => {
      return deleteCommentService(db, input.comment_id, ctx.userId!);
    }),

    acceptSolution: wrapWriteTool('accept_solution', async (input, ctx) => {
      return acceptSolutionService(db, input.post_id, { commentId: input.comment_id }, ctx.userId!);
    }),

    toggleReaction: wrapWriteTool('toggle_reaction', async (input, ctx) => {
      return toggleReactionService(db, {
        targetType: input.target_type,
        targetId: input.target_id,
        reactionType: input.reaction_type,
      }, ctx.userId!);
    }),

    toggleBookmark: wrapWriteTool('toggle_bookmark', async (input, ctx) => {
      return toggleBookmarkService(db, ctx.userId!, input.post_id);
    }),

    followUser: wrapWriteTool('follow_user', async (input, ctx) => {
      const followeeId = await resolveUserId(input.user_slug);
      return followUserService(db, ctx.userId!, followeeId);
    }),

    unfollowUser: wrapWriteTool('unfollow_user', async (input, ctx) => {
      const followeeId = await resolveUserId(input.user_slug);
      return unfollowUserService(db, ctx.userId!, followeeId);
    }),

    joinCircle: wrapWriteTool('join_circle', async (input, ctx) => {
      return joinGroupService(db, input.group_slug, ctx.userId!, {
        inviteCode: input.invite_code,
      });
    }),

    leaveCircle: wrapWriteTool('leave_circle', async (input, ctx) => {
      await leaveGroupService(db, input.group_slug, ctx.userId!);
      return { left: true, group_slug: input.group_slug };
    }),

    // --- community:admin (requireGlobalAdmin in wrapper; mutating tools audit) ---

    adminListUsers: wrapAdminTool('admin_list_users', async (input, _ctx) => {
      return adminListUsersService(db, {
        q: input.q,
        role: input.role,
        page: input.page,
        limit: input.limit,
      });
    }),

    adminGetUser: wrapAdminTool('admin_get_user', async (input, _ctx) => {
      const id = await resolveUserId(input.user_slug);
      return adminGetUserService(db, id);
    }),

    adminSetUserRole: wrapAdminTool('admin_set_user_role', async (input, ctx) => {
      const actorId = ctx.userId!;
      const id = await resolveUserId(input.user_slug);
      await adminSetUserRoleService(db, id, input.role);
      await audit({
        actorId,
        action: 'update_user_role',
        targetType: 'user',
        targetId: id,
        targetUserId: id,
        details: { role: input.role },
      });
      return { success: true, user_id: id, role: input.role };
    }),

    adminDeleteUser: wrapAdminTool('admin_delete_user', async (input, ctx) => {
      const actorId = ctx.userId!;
      const id = await resolveUserId(input.user_slug);
      const result = await adminDeleteUserService(db, id);
      await audit({
        actorId,
        action: 'delete_user',
        targetType: 'user',
        targetId: id,
        targetUserId: id,
      });
      return result;
    }),

    adminListGroups: wrapAdminToolNoInput('admin_list_groups', async (_ctx) => {
      return adminListGroupsService(db);
    }),

    adminCreateGroup: wrapAdminTool('admin_create_group', async (input, ctx) => {
      const actorId = ctx.userId!;
      const group = await adminCreateGroupService(db, {
        slug: input.slug,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        color: input.color,
        requiredTierId: input.required_tier_id,
      }, actorId);
      await audit({
        actorId,
        action: 'create_group',
        targetType: 'group',
        targetId: group.id,
        details: { slug: input.slug, name: input.name },
      });
      return group;
    }),

    adminUpdateGroup: wrapAdminTool('admin_update_group', async (input, ctx) => {
      const actorId = ctx.userId!;
      const existing = await getGroupBySlug(db, input.group_slug);
      if (!existing) throw new Error('Group not found');
      const update: Record<string, unknown> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.description !== undefined) update.description = input.description;
      if (input.color !== undefined) update.color = input.color;
      if (input.visibility !== undefined) update.visibility = input.visibility;
      // requiredTierId is nullable: only forward it when the caller provided a
      // value (incl. null to clear) — adminUpdateGroup uses `'requiredTierId'
      // in input` to decide, so omitting the key leaves it untouched.
      if (input.required_tier_id !== undefined) update.requiredTierId = input.required_tier_id;
      if (input.post_approval !== undefined) update.postApproval = input.post_approval;
      if (input.icon !== undefined) update.icon = input.icon;
      const group = await adminUpdateGroupService(
        db,
        existing.id,
        update as Parameters<typeof adminUpdateGroupService>[2]
      );
      await audit({
        actorId,
        action: 'update_group',
        targetType: 'group',
        targetId: group.id,
        details: { fields: Object.keys(update) },
      });
      return group;
    }),

    adminDeleteGroup: wrapAdminTool('admin_delete_group', async (input, ctx) => {
      const actorId = ctx.userId!;
      const existing = await getGroupBySlug(db, input.group_slug);
      if (!existing) throw new Error('Group not found');
      const result = await adminDeleteGroupService(db, existing.id);
      await audit({
        actorId,
        action: 'delete_group',
        targetType: 'group',
        targetId: existing.id,
      });
      return result;
    }),

    adminUpdateSettings: wrapAdminTool('admin_update_settings', async (input, ctx) => {
      const actorId = ctx.userId!;
      await adminUpdateSettingsService(db, input.section, input.values);
      await audit({
        actorId,
        action: 'settings_update',
        targetType: 'settings',
        targetId: input.section,
        details: { section: input.section },
      });
      return { success: true, section: input.section };
    }),

    adminAwardPoints: wrapAdminTool('admin_award_points', async (input, ctx) => {
      const actorId = ctx.userId!;
      const targetId = await resolveUserId(input.user_slug);
      const result = await adminAwardPointsService(db, actorId, {
        userSlug: input.user_slug,
        points: input.points,
        reason: input.reason,
      });
      await audit({
        actorId,
        action: 'award_points',
        targetType: 'user',
        targetId,
        targetUserId: targetId,
        details: { points: input.points, reason: input.reason },
      });
      return result;
    }),

    adminListBadges: wrapAdminToolNoInput('admin_list_badges', async (_ctx) => {
      return adminListBadgesService(db);
    }),

    adminCreateBadge: wrapAdminTool('admin_create_badge', async (input, ctx) => {
      const actorId = ctx.userId!;
      const badge = await adminCreateBadgeService(db, {
        slug: input.slug,
        name: input.name,
        description: input.description,
        iconUrl: input.icon_url,
        // MCP-authored badges are typically manual-award only, so criteria
        // defaults to {} (the column default). Cast to satisfy the union type;
        // the DB stores whatever jsonb the caller passed.
        criteria: (input.criteria ?? {}) as CreateBadgeRequest['criteria'],
        sortOrder: input.sort_order,
      });
      // No 'badge' audit target type — record the id in details instead.
      await audit({
        actorId,
        action: 'create_badge',
        targetId: badge.id,
        details: { slug: input.slug, name: input.name },
      });
      return badge;
    }),

    adminAwardBadge: wrapAdminTool('admin_award_badge', async (input, ctx) => {
      const actorId = ctx.userId!;
      const badgeId = await resolveBadgeId(input.badge_slug);
      const targetId = await resolveUserId(input.user_slug);
      await adminAwardBadgeService(db, badgeId, actorId, input.user_slug, input.reason);
      await audit({
        actorId,
        action: 'award_badge',
        targetType: 'user',
        targetId,
        targetUserId: targetId,
        details: { badgeId, badgeSlug: input.badge_slug, reason: input.reason },
      });
      return { success: true, badge_slug: input.badge_slug, user_slug: input.user_slug };
    }),

    adminListWatchedPhrases: wrapAdminToolNoInput('admin_list_watched_phrases', async (_ctx) => {
      return adminListWatchedPhrasesService(db);
    }),

    adminCreateWatchedPhrase: wrapAdminTool('admin_create_watched_phrase', async (input, ctx) => {
      const actorId = ctx.userId!;
      const phrase = await adminCreateWatchedPhraseService(db, {
        phrase: input.phrase,
        sanctionedFraming: input.sanctioned_framing,
        isRegex: input.is_regex,
        autoFlag: input.auto_flag,
      });
      // No 'phrase' audit target type — record the id in details instead.
      await audit({
        actorId,
        action: 'watched_phrase_create',
        targetId: phrase.id,
        details: { phrase: input.phrase },
      });
      return phrase;
    }),

    adminDeleteWatchedPhrase: wrapAdminTool('admin_delete_watched_phrase', async (input, ctx) => {
      const actorId = ctx.userId!;
      await adminDeleteWatchedPhraseService(db, input.phrase_id);
      await audit({
        actorId,
        action: 'watched_phrase_delete',
        targetId: input.phrase_id,
      });
      return { success: true, phrase_id: input.phrase_id };
    }),

    adminResolveFlag: wrapAdminTool('admin_resolve_flag', async (input, ctx) => {
      const actorId = ctx.userId!;
      const flag = await resolveFlagService(db, input.flag_id, {
        status: input.status,
        resolutionNote: input.resolution_note,
      }, actorId);
      // No 'flag' audit target type — record the id in details instead.
      await audit({
        actorId,
        action: input.status === 'dismissed' ? 'flag_dismissed' : 'flag_resolved',
        targetId: input.flag_id,
        details: { status: input.status },
      });
      return flag;
    }),

    adminDeleteFlag: wrapAdminTool('admin_delete_flag', async (input, ctx) => {
      const actorId = ctx.userId!;
      await deleteFlagService(db, input.flag_id, actorId);
      await audit({
        actorId,
        action: 'flag_dismissed',
        targetId: input.flag_id,
      });
      return { success: true, flag_id: input.flag_id };
    }),

    adminListAuditLogs: wrapAdminTool('admin_list_audit_logs', async (input, _ctx) => {
      return adminListAuditLogsService(db, {
        page: input.page,
        limit: input.limit,
        moderatorId: input.moderator_id,
        actionType: input.action_type,
        targetType: input.target_type,
        circleId: input.circle_id,
        dateFrom: input.date_from,
        dateTo: input.date_to,
      });
    }),

    adminListMcpClients: wrapAdminToolNoInput('admin_list_mcp_clients', async (_ctx) => {
      return adminListMcpClientsService(db);
    }),

    adminRevokeMcpClient: wrapAdminTool('admin_revoke_mcp_client', async (input, ctx) => {
      const actorId = ctx.userId!;
      await adminRevokeMcpClientService(db, input.client_id);
      await audit({
        actorId,
        action: 'mcp_client_revoke',
        targetType: 'mcp_client',
        targetId: input.client_id,
      });
      return { success: true, client_id: input.client_id };
    }),
  };

  // --- helpers (close over db) ---

  async function resolveUserId(slug: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
      columns: { id: true },
    });
    if (!user) throw new Error(`User not found: ${slug}`);
    return user.id;
  }

  async function resolveBadgeId(slug: string): Promise<string> {
    const badge = await db.query.badges.findFirst({
      where: eq(schema.badges.slug, slug),
      columns: { id: true },
    });
    if (!badge) throw new Error(`Badge not found: ${slug}`);
    return badge.id;
  }

  function audit(input: AuditInput): Promise<void> {
    return adminCreateAuditLog(db, input);
  }

  function wrapReadTool<TInput, TOutput>(
    toolName: string,
    handler: (input: TInput, ctx: McpContext) => Promise<TOutput>
  ): (input: TInput, ctx: McpContext) => Promise<TOutput> {
    return async (input, ctx) => {
      const start = Date.now();
      let result: TOutput | undefined;
      let error: string | undefined;

      try {
        result = await handler(input, ctx);
        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const durationMs = Date.now() - start;
        if (Math.random() < READ_TOOL_SAMPLE_RATE) {
          await logAgentAction(db, logger, {
            clientId: ctx.clientId,
            userId: ctx.userId,
            toolName,
            input,
            output: result,
            error: error ?? null,
            durationMs,
          });
        }
      }
    };
  }

  function wrapReadResource<TArg, TOutput>(
    resourceName: string,
    handler: (arg: TArg, ctx: McpContext, query?: { groupSlug?: string; period?: string }) => Promise<TOutput>
  ): (arg: TArg, ctx: McpContext, query?: { groupSlug?: string; period?: string }) => Promise<TOutput> {
    return async (arg, ctx, query) => {
      const start = Date.now();
      let result: TOutput | undefined;
      let error: string | undefined;

      try {
        result = await handler(arg, ctx, query);
        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const durationMs = Date.now() - start;
        if (Math.random() < READ_TOOL_SAMPLE_RATE) {
          await logAgentAction(db, logger, {
            clientId: ctx.clientId,
            userId: ctx.userId,
            toolName: `resource:${resourceName}`,
            input: { arg, query },
            output: result,
            error: error ?? null,
            durationMs,
          });
        }
      }
    };
  }

  function wrapWriteTool<TInput, TOutput>(
    toolName: string,
    handler: (input: TInput, ctx: McpContext) => Promise<TOutput>
  ): (input: TInput, ctx: McpContext) => Promise<TOutput> {
    return async (input, ctx) => {
      const rl = await checkRateLimit('mcpWrite', ctx.clientId);
      if (!rl.success) throw new Error('Rate limit exceeded for MCP write tools');
      const start = Date.now();
      let result: TOutput | undefined;
      let error: string | undefined;
      try {
        result = await handler(input, ctx);
        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const durationMs = Date.now() - start;
        // Writes are accountable — log every call, not a sample.
        await logAgentAction(db, logger, {
          clientId: ctx.clientId,
          userId: ctx.userId,
          toolName,
          input,
          output: result,
          error: error ?? null,
          durationMs,
        });
      }
    };
  }

  function wrapAdminTool<TInput, TOutput>(
    toolName: string,
    handler: (input: TInput, ctx: McpContext) => Promise<TOutput>
  ): (input: TInput, ctx: McpContext) => Promise<TOutput> {
    return async (input, ctx) => {
      const rl = await checkRateLimit('mcpAdmin', ctx.clientId);
      if (!rl.success) throw new Error('Rate limit exceeded for MCP admin tools');
      const start = Date.now();
      let result: TOutput | undefined;
      let error: string | undefined;
      try {
        // requireGlobalAdmin throws 'Forbidden' if the bound user isn't an
        // admin — handlers may assume ctx.userId is present (gated by
        // requireUserId in tools.ts) and that the user is an admin.
        await requireGlobalAdmin(db, ctx.userId!);
        result = await handler(input, ctx);
        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const durationMs = Date.now() - start;
        await logAgentAction(db, logger, {
          clientId: ctx.clientId,
          userId: ctx.userId,
          toolName,
          input,
          output: result,
          error: error ?? null,
          durationMs,
        });
      }
    };
  }

  // Variant for admin tools that take no input (the McpToolServices interface
  // declares them as (ctx) rather than (input, ctx), so wrapAdminTool's
  // two-arg return shape won't assign).
  function wrapAdminToolNoInput<TOutput>(
    toolName: string,
    handler: (ctx: McpContext) => Promise<TOutput>
  ): (ctx: McpContext) => Promise<TOutput> {
    return async (ctx) => {
      const rl = await checkRateLimit('mcpAdmin', ctx.clientId);
      if (!rl.success) throw new Error('Rate limit exceeded for MCP admin tools');
      const start = Date.now();
      let result: TOutput | undefined;
      let error: string | undefined;
      try {
        await requireGlobalAdmin(db, ctx.userId!);
        result = await handler(ctx);
        return result;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const durationMs = Date.now() - start;
        await logAgentAction(db, logger, {
          clientId: ctx.clientId,
          userId: ctx.userId,
          toolName,
          input: null,
          output: result,
          error: error ?? null,
          durationMs,
        });
      }
    };
  }
}

// Matches LeaderboardWindow — weekly and monthly are materialized by the
// points trigger (migration 0010); quarterly is not, so it falls back to
// all_time (and the MCP enum no longer offers it).
function toServicePeriod(period: string): 'all_time' | 'weekly' | 'monthly' {
  if (period === 'weekly') return 'weekly';
  if (period === 'monthly') return 'monthly';
  return 'all_time';
}

function flattenComments(
  comments: { contentPlain: string; replies?: unknown[] }[]
): { contentPlain: string }[] {
  const out: { contentPlain: string }[] = [];
  for (const c of comments) {
    out.push(c);
    if (c.replies) {
      out.push(...flattenComments(c.replies as { contentPlain: string; replies?: unknown[] }[]));
    }
  }
  return out;
}

async function logAgentAction(
  db: DrizzleClient,
  logger: Logger,
  action: AgentActionInput
): Promise<void> {
  try {
    await db.insert(schema.agentActions).values({
      clientId: action.clientId,
      userId: action.userId ?? null,
      toolName: action.toolName,
      input: action.input,
      output: action.output ?? {},
      error: action.error ?? null,
      durationMs: action.durationMs ?? null,
    });
  } catch (err) {
    logger.error({ err, action }, 'Failed to log MCP agent action');
  }
}