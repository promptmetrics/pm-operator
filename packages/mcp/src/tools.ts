import { McpServer } from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { McpLogger } from './server';
import { REQUIRED_WRITE_SCOPE, REQUIRED_ADMIN_SCOPE } from './auth';

export interface McpContext {
  clientId: string;
  scopes: string[];
  token: string;
  userId?: string;
}

export interface McpToolServices {
  // community:read (existing)
  searchPosts(input: SearchPostsInput, ctx: McpContext): Promise<unknown>;
  getUserProfile(input: GetUserProfileInput, ctx: McpContext): Promise<unknown>;
  listLeaderboards(input: ListLeaderboardsInput, ctx: McpContext): Promise<unknown>;
  summarizeThread(input: SummarizeThreadInput, ctx: McpContext): Promise<unknown>;

  // community:write (engagement — act as the bound user)
  createPost(input: CreatePostInput, ctx: McpContext): Promise<unknown>;
  updatePost(input: UpdatePostInput, ctx: McpContext): Promise<unknown>;
  deletePost(input: DeletePostInput, ctx: McpContext): Promise<unknown>;
  createComment(input: CreateCommentInput, ctx: McpContext): Promise<unknown>;
  updateComment(input: UpdateCommentInput, ctx: McpContext): Promise<unknown>;
  deleteComment(input: DeleteCommentInput, ctx: McpContext): Promise<unknown>;
  acceptSolution(input: AcceptSolutionInput, ctx: McpContext): Promise<unknown>;
  toggleReaction(input: ToggleReactionInput, ctx: McpContext): Promise<unknown>;
  toggleBookmark(input: ToggleBookmarkInput, ctx: McpContext): Promise<unknown>;
  followUser(input: FollowUserInput, ctx: McpContext): Promise<unknown>;
  unfollowUser(input: UnfollowUserInput, ctx: McpContext): Promise<unknown>;
  joinCircle(input: JoinCircleInput, ctx: McpContext): Promise<unknown>;
  leaveCircle(input: LeaveCircleInput, ctx: McpContext): Promise<unknown>;

  // community:admin (operations — require global admin, audited)
  adminListUsers(input: AdminListUsersInput, ctx: McpContext): Promise<unknown>;
  adminGetUser(input: AdminGetUserInput, ctx: McpContext): Promise<unknown>;
  adminSetUserRole(input: AdminSetUserRoleInput, ctx: McpContext): Promise<unknown>;
  adminDeleteUser(input: AdminDeleteUserInput, ctx: McpContext): Promise<unknown>;
  adminListGroups(ctx: McpContext): Promise<unknown>;
  adminCreateGroup(input: AdminCreateGroupInput, ctx: McpContext): Promise<unknown>;
  adminUpdateGroup(input: AdminUpdateGroupInput, ctx: McpContext): Promise<unknown>;
  adminDeleteGroup(input: AdminDeleteGroupInput, ctx: McpContext): Promise<unknown>;
  adminUpdateSettings(input: AdminUpdateSettingsInput, ctx: McpContext): Promise<unknown>;
  adminAwardPoints(input: AdminAwardPointsInput, ctx: McpContext): Promise<unknown>;
  adminListBadges(ctx: McpContext): Promise<unknown>;
  adminCreateBadge(input: AdminCreateBadgeInput, ctx: McpContext): Promise<unknown>;
  adminAwardBadge(input: AdminAwardBadgeInput, ctx: McpContext): Promise<unknown>;
  adminListWatchedPhrases(ctx: McpContext): Promise<unknown>;
  adminCreateWatchedPhrase(input: AdminCreateWatchedPhraseInput, ctx: McpContext): Promise<unknown>;
  adminDeleteWatchedPhrase(input: AdminDeleteWatchedPhraseInput, ctx: McpContext): Promise<unknown>;
  adminResolveFlag(input: AdminResolveFlagInput, ctx: McpContext): Promise<unknown>;
  adminDeleteFlag(input: AdminDeleteFlagInput, ctx: McpContext): Promise<unknown>;
  adminListAuditLogs(input: AdminListAuditLogsInput, ctx: McpContext): Promise<unknown>;
  adminListMcpClients(ctx: McpContext): Promise<unknown>;
  adminRevokeMcpClient(input: AdminRevokeMcpClientInput, ctx: McpContext): Promise<unknown>;
}

// --- community:read input schemas (existing) -----------------------------

export const searchPostsSchema = z.object({
  query: z.string().min(1),
  group_slug: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sort: z.enum(['relevance', 'new', 'top']).default('relevance'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchPostsInput = z.infer<typeof searchPostsSchema>;

export const getUserProfileSchema = z.object({
  user_slug: z.string().min(1),
});

export type GetUserProfileInput = z.infer<typeof getUserProfileSchema>;

export const listLeaderboardsSchema = z.object({
  type: z.enum(['operator-stack', 'show-your-build', 'all-time']),
  group_slug: z.string().optional(),
  // Only weekly/monthly are materialized by the points trigger (migration
  // 0010); quarterly rows are never written, so we don't advertise it.
  period: z.enum(['weekly', 'monthly', 'all_time']).default('all_time'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ListLeaderboardsInput = z.infer<typeof listLeaderboardsSchema>;

export const summarizeThreadSchema = z.object({
  post_id: z.string().uuid(),
  max_length: z.number().int().min(50).max(2000).default(300),
});

export type SummarizeThreadInput = z.infer<typeof summarizeThreadSchema>;

// --- community:write input schemas ---------------------------------------
// Snake_case fields (matching the read tools' convention); the service layer
// maps them onto the camelCase service inputs. Kept permissive over tight
// REST contracts because the MCP package depends on zod v4 while
// @pm-operator/api ships zod v3 — importing the v3 contract schemas here
// would break registerTool, which expects v4 schemas.

const postTypeSchema = z.enum(['discussion', 'question', 'build', 'lesson']);
const postStatusSchema = z.enum(['published', 'draft', 'flagged', 'hidden', 'deleted']);
const commentStatusSchema = z.enum(['published', 'hidden', 'deleted']);
const reactionTypeSchema = z.enum(['like', 'celebrate']);
const targetTypeSchema = z.enum(['post', 'comment']);
const userRoleSchema = z.enum(['member', 'moderator', 'admin']);

export const createPostSchema = z.object({
  group_slug: z.string().min(1),
  title: z.string().min(1).max(300),
  content: z.string().min(1),
  type: postTypeSchema.default('discussion'),
  tags: z.array(z.string()).default([]),
  cover_image_url: z.string().nullable().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  post_id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).optional(),
  type: postTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  status: postStatusSchema.optional(),
  cover_image_url: z.string().nullable().optional(),
  featured_label: z.string().max(40).nullable().optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const deletePostSchema = z.object({ post_id: z.string().uuid() });
export type DeletePostInput = z.infer<typeof deletePostSchema>;

export const createCommentSchema = z.object({
  post_id: z.string().uuid(),
  content: z.string().min(1),
  parent_comment_id: z.string().uuid().nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  comment_id: z.string().uuid(),
  content: z.string().min(1).optional(),
  status: commentStatusSchema.optional(),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const deleteCommentSchema = z.object({ comment_id: z.string().uuid() });
export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;

export const acceptSolutionSchema = z.object({
  post_id: z.string().uuid(),
  comment_id: z.string().uuid(),
});
export type AcceptSolutionInput = z.infer<typeof acceptSolutionSchema>;

export const toggleReactionSchema = z.object({
  target_type: targetTypeSchema,
  target_id: z.string().uuid(),
  reaction_type: reactionTypeSchema.default('like'),
});
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

export const toggleBookmarkSchema = z.object({ post_id: z.string().uuid() });
export type ToggleBookmarkInput = z.infer<typeof toggleBookmarkSchema>;

export const followUserSchema = z.object({ user_slug: z.string().min(1) });
export type FollowUserInput = z.infer<typeof followUserSchema>;

export const unfollowUserSchema = z.object({ user_slug: z.string().min(1) });
export type UnfollowUserInput = z.infer<typeof unfollowUserSchema>;

export const joinCircleSchema = z.object({
  group_slug: z.string().min(1),
  invite_code: z.string().optional(),
});
export type JoinCircleInput = z.infer<typeof joinCircleSchema>;

export const leaveCircleSchema = z.object({ group_slug: z.string().min(1) });
export type LeaveCircleInput = z.infer<typeof leaveCircleSchema>;

// --- community:admin input schemas ---------------------------------------

// The SDK's createToolExecutor uses a 1-arg callback (cb(ctx)) when a tool's
// inputSchema is falsy, but our adminTool wrapper expects (args, ctx) — so a
// schemaless tool would get ctx=undefined and crash reading ctx.http. Give the
// no-arg admin tools an empty object schema so the SDK takes the normal 2-arg
// path; `{}` validates against `{}` and the args are ignored by the handler.
const noInputSchema = z.object({});

export const adminListUsersSchema = z.object({
  q: z.string().optional(),
  role: userRoleSchema.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});
export type AdminListUsersInput = z.infer<typeof adminListUsersSchema>;

export const adminGetUserSchema = z.object({ user_slug: z.string().min(1) });
export type AdminGetUserInput = z.infer<typeof adminGetUserSchema>;

export const adminSetUserRoleSchema = z.object({
  user_slug: z.string().min(1),
  role: userRoleSchema,
});
export type AdminSetUserRoleInput = z.infer<typeof adminSetUserRoleSchema>;

export const adminDeleteUserSchema = z.object({ user_slug: z.string().min(1) });
export type AdminDeleteUserInput = z.infer<typeof adminDeleteUserSchema>;

export const adminCreateGroupSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  // CreateGroupRequest requires visibility; the DB column defaults to 'public'
  // but the service type is non-optional, so we surface it with a matching
  // default rather than relying on the DB.
  visibility: z.enum(['public', 'invite_only', 'paid']).default('public'),
  color: z.string().optional(),
  required_tier_id: z.string().uuid().optional(),
});
export type AdminCreateGroupInput = z.infer<typeof adminCreateGroupSchema>;

export const adminUpdateGroupSchema = z.object({
  group_slug: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  visibility: z.string().optional(),
  required_tier_id: z.string().uuid().nullable().optional(),
  post_approval: z.boolean().optional(),
  icon: z.string().optional(),
});
export type AdminUpdateGroupInput = z.infer<typeof adminUpdateGroupSchema>;

export const adminDeleteGroupSchema = z.object({ group_slug: z.string().min(1) });
export type AdminDeleteGroupInput = z.infer<typeof adminDeleteGroupSchema>;

export const adminUpdateSettingsSchema = z.object({
  section: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});
export type AdminUpdateSettingsInput = z.infer<typeof adminUpdateSettingsSchema>;

export const adminAwardPointsSchema = z.object({
  user_slug: z.string().min(1),
  points: z.number(),
  reason: z.string().min(1),
});
export type AdminAwardPointsInput = z.infer<typeof adminAwardPointsSchema>;

export const adminCreateBadgeSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  icon_url: z.string().optional(),
  // CreateBadgeRequest requires criteria (a union of count/compound/streak
  // shapes). Passed through permissively — MCP-authored badges are typically
  // manual-award only, so criteria defaults to {} (the DB column default) and
  // the wrapper casts to satisfy the service type.
  criteria: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().min(0).default(0),
});
export type AdminCreateBadgeInput = z.infer<typeof adminCreateBadgeSchema>;

export const adminAwardBadgeSchema = z.object({
  badge_slug: z.string().min(1),
  user_slug: z.string().min(1),
  reason: z.string().optional(),
});
export type AdminAwardBadgeInput = z.infer<typeof adminAwardBadgeSchema>;

export const adminCreateWatchedPhraseSchema = z.object({
  phrase: z.string().min(1),
  sanctioned_framing: z.string().optional(),
  is_regex: z.boolean().default(false),
  auto_flag: z.boolean().default(true),
});
export type AdminCreateWatchedPhraseInput = z.infer<typeof adminCreateWatchedPhraseSchema>;

export const adminDeleteWatchedPhraseSchema = z.object({ phrase_id: z.string().uuid() });
export type AdminDeleteWatchedPhraseInput = z.infer<typeof adminDeleteWatchedPhraseSchema>;

export const adminResolveFlagSchema = z.object({
  flag_id: z.string().uuid(),
  status: z.enum(['resolved', 'dismissed']),
  resolution_note: z.string().optional(),
});
export type AdminResolveFlagInput = z.infer<typeof adminResolveFlagSchema>;

export const adminDeleteFlagSchema = z.object({ flag_id: z.string().uuid() });
export type AdminDeleteFlagInput = z.infer<typeof adminDeleteFlagSchema>;

export const adminListAuditLogsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  moderator_id: z.string().uuid().optional(),
  action_type: z.string().optional(),
  target_type: z.string().optional(),
  circle_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});
export type AdminListAuditLogsInput = z.infer<typeof adminListAuditLogsSchema>;

export const adminRevokeMcpClientSchema = z.object({ client_id: z.string().min(1) });
export type AdminRevokeMcpClientInput = z.infer<typeof adminRevokeMcpClientSchema>;

// --- Output schemas (2026-07-28 structuredContent) -----------------------
// These mirror the service return shapes in apps/web/lib/services/mcp.ts,
// kept deliberately permissive (z.string()/z.number() over tight enums) so
// the structured payload validates without coupling MCP to the REST API's
// zod v3 contract schemas. Write/admin tools return JSON as text content
// only — their return shapes are heterogeneous (entities, arrays, acks), so
// a single permissive object schema can't cover them all uniformly.

const searchResultOutSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  isSolved: z.boolean(),
  group: z.object({
    slug: z.string(),
    name: z.string(),
    color: z.string().nullable().optional(),
  }),
  author: z.object({
    userslug: z.string(),
    username: z.string(),
    reputationScore: z.number(),
    acceptedSolutions: z.number().int().nonnegative(),
    level: z.number().int().min(1),
  }),
  upvotes: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  excerpt: z.string().optional(),
  createdAt: z.string(),
  coverImageUrl: z.string().nullable().optional(),
  rank: z.number(),
});

const searchPostsOutSchema = z.object({
  results: z.array(searchResultOutSchema),
  nextCursor: z.string().optional(),
});

const userProfileOutSchema = z.object({
  id: z.string(),
  username: z.string(),
  userslug: z.string(),
  fullName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  role: z.string(),
  reputationScore: z.number(),
  streakDays: z.number().int().nonnegative(),
  acceptedSolutions: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  aboutMe: z.string().nullable(),
  postsCount: z.number().int().nonnegative(),
  joinedAt: z.string(),
  levelInfo: z.object({
    level: z.number().int().min(1),
    name: z.string(),
    nextLevel: z
      .object({ level: z.number(), name: z.string(), minScore: z.number() })
      .nullable(),
    pointsToNext: z.number().nullable(),
    progressPercent: z.number(),
  }),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
});

const leaderboardEntryOutSchema = z.object({
  rank: z.number().int().positive(),
  userslug: z.string(),
  username: z.string(),
  score: z.number(),
  acceptedSolutions: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  streakDays: z.number().int().nonnegative(),
  role: z.string(),
});

const listLeaderboardsOutSchema = z.object({
  type: z.string(),
  period: z.string(),
  groupSlug: z.string().optional(),
  entries: z.array(leaderboardEntryOutSchema),
});

const summarizeThreadOutSchema = z.object({
  post_id: z.string(),
  title: z.string(),
  summary: z.string(),
  comment_count: z.number().int().nonnegative(),
  max_length: z.number().int().positive(),
});

// --- Per-tool authz helpers ----------------------------------------------
// Pure (no db): the scope gate lives in the MCP package; the db-backed
// requireGlobalAdmin check lives in the web service wrapper (wrapAdminTool).

/** Returns an error message if `mctx` lacks `scope`, else null. */
export function requireScope(mctx: McpContext, scope: string): string | null {
  if (!mctx.scopes.includes(scope)) {
    return `Missing required scope: ${scope}`;
  }
  return null;
}

/** Returns an error message if the token carries no bound user, else null. */
export function requireUserId(mctx: McpContext): string | null {
  if (!mctx.userId) {
    return 'This tool requires a user-bound token (mint with --user-slug)';
  }
  return null;
}

export function registerTools(
  server: McpServer,
  services: McpToolServices,
  logger: McpLogger
): void {
  // Shared handler for write/admin tools: scope + user-bound gate, then call
  // the service (which itself rate-limits, checks admin, logs, and audits).
  // Returns JSON as text content — write/admin return shapes are too varied
  // for one structured output schema. The explicit return type keeps
  // `content[].type` as the literal "text" — without it the inferred type
  // widens to string and registerTool rejects the callback (the read tools
  // avoid this only because their callbacks are contextually typed inline).
  type ScopedToolResult = {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
  };
  const runScopedTool = async (
    name: string,
    scope: string,
    mctx: McpContext,
    handler: () => Promise<unknown>
  ): Promise<ScopedToolResult> => {
    const denied = requireScope(mctx, scope) ?? requireUserId(mctx);
    if (denied) return { isError: true, content: [{ type: 'text', text: denied }] };
    logger.debug({ clientId: mctx.clientId, tool: name }, name);
    try {
      const result = await handler();
      const payload = result ?? { success: true };
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : `${name} failed`;
      logger.error({ err, clientId: mctx.clientId, tool: name }, message);
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  };

  const writeTool = (
    name: string,
    description: string,
    inputSchema: z.ZodType,
    handler: (args: unknown, mctx: McpContext) => Promise<unknown>,
    annotations?: { destructiveHint: boolean }
  ) => {
    server.registerTool(
      name,
      { description, inputSchema: inputSchema as z.ZodObject, annotations },
      async (args, ctx) => {
        const mctx = toContext(ctx.http?.authInfo);
        return runScopedTool(name, REQUIRED_WRITE_SCOPE, mctx, () => handler(args, mctx));
      }
    );
  };

  const adminTool = (
    name: string,
    description: string,
    inputSchema: z.ZodType | undefined,
    handler: (args: unknown, mctx: McpContext) => Promise<unknown>,
    annotations?: { destructiveHint: boolean }
  ) => {
    server.registerTool(
      name,
      {
        description,
        ...(inputSchema ? { inputSchema: inputSchema as z.ZodObject } : {}),
        annotations,
      },
      async (args, ctx) => {
        const mctx = toContext(ctx.http?.authInfo);
        return runScopedTool(name, REQUIRED_ADMIN_SCOPE, mctx, () => handler(args, mctx));
      }
    );
  };

  // --- community:read (existing) -----------------------------------------

  server.registerTool(
    'search_posts',
    {
      description:
        'Search public community posts. Boosts solved posts and exact tag matches.',
      inputSchema: searchPostsSchema,
      outputSchema: searchPostsOutSchema,
    },
    async (args, ctx) => {
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, tool: 'search_posts' }, 'search_posts');
      try {
        const result = (await services.searchPosts(args, mctx)) as z.infer<
          typeof searchPostsOutSchema
        >;
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        logger.error({ err, clientId: mctx.clientId, tool: 'search_posts' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'get_user_profile',
    {
      description: 'Return a public user profile, reputation, badges, and top circles.',
      inputSchema: getUserProfileSchema,
      outputSchema: userProfileOutSchema,
    },
    async (args, ctx) => {
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, tool: 'get_user_profile' }, 'get_user_profile');
      try {
        const result = await services.getUserProfile(args, mctx);
        if (result == null) {
          return { isError: true, content: [{ type: 'text', text: 'User not found' }] };
        }
        const profile = result as z.infer<typeof userProfileOutSchema>;
        return {
          structuredContent: profile,
          content: [{ type: 'text', text: JSON.stringify(profile) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        logger.error({ err, clientId: mctx.clientId, tool: 'get_user_profile' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'list_leaderboards',
    {
      description: 'Return a leaderboard. Use empty group_slug for global.',
      inputSchema: listLeaderboardsSchema,
      outputSchema: listLeaderboardsOutSchema,
    },
    async (args, ctx) => {
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, tool: 'list_leaderboards' }, 'list_leaderboards');
      try {
        const result = (await services.listLeaderboards(args, mctx)) as z.infer<
          typeof listLeaderboardsOutSchema
        >;
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load leaderboard';
        logger.error({ err, clientId: mctx.clientId, tool: 'list_leaderboards' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'summarize_thread',
    {
      description:
        'Summarize a post and its comments synchronously using a simple truncation heuristic. Returns the summary immediately.',
      inputSchema: summarizeThreadSchema,
      outputSchema: summarizeThreadOutSchema,
    },
    async (args, ctx) => {
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, tool: 'summarize_thread' }, 'summarize_thread');
      try {
        const result = (await services.summarizeThread(args, mctx)) as z.infer<
          typeof summarizeThreadOutSchema
        >;
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to summarize thread';
        logger.error({ err, clientId: mctx.clientId, tool: 'summarize_thread' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  // --- community:write ----------------------------------------------------

  writeTool(
    'create_post',
    'Create a post in a circle. Awards topic_created points and advances the author streak (replicating the web post route).',
    createPostSchema,
    (args, mctx) => services.createPost(args as CreatePostInput, mctx)
  );

  writeTool(
    'update_post',
    'Update a post. Author, circle moderator, or admin only (service enforces). featured_label is admin-only.',
    updatePostSchema,
    (args, mctx) => services.updatePost(args as UpdatePostInput, mctx)
  );

  writeTool(
    'delete_post',
    'Soft-delete a post (sets status=hidden). Author, circle moderator, or admin only.',
    deletePostSchema,
    (args, mctx) => services.deletePost(args as DeletePostInput, mctx),
    { destructiveHint: true }
  );

  writeTool(
    'create_comment',
    'Create a comment on a post (optionally a reply via parent_comment_id). The service awards points, notifies, and auto-flags watched phrases.',
    createCommentSchema,
    (args, mctx) => services.createComment(args as CreateCommentInput, mctx)
  );

  writeTool(
    'update_comment',
    'Update a comment (content and/or status). Author or moderator only.',
    updateCommentSchema,
    (args, mctx) => services.updateComment(args as UpdateCommentInput, mctx)
  );

  writeTool(
    'delete_comment',
    'Soft-delete a comment (sets status=deleted). Author or moderator only.',
    deleteCommentSchema,
    (args, mctx) => services.deleteComment(args as DeleteCommentInput, mctx),
    { destructiveHint: true }
  );

  writeTool(
    'accept_solution',
    'Mark a comment as the accepted solution on a question post. Post author, admin, or circle moderator only; emails the solver.',
    acceptSolutionSchema,
    (args, mctx) => services.acceptSolution(args as AcceptSolutionInput, mctx)
  );

  writeTool(
    'toggle_reaction',
    'Toggle a reaction (like/celebrate) on a post or comment. Join the circle first if it is gated.',
    toggleReactionSchema,
    (args, mctx) => services.toggleReaction(args as ToggleReactionInput, mctx)
  );

  writeTool(
    'toggle_bookmark',
    'Bookmark or unbookmark a post.',
    toggleBookmarkSchema,
    (args, mctx) => services.toggleBookmark(args as ToggleBookmarkInput, mctx)
  );

  writeTool(
    'follow_user',
    'Follow a user by their slug.',
    followUserSchema,
    (args, mctx) => services.followUser(args as FollowUserInput, mctx)
  );

  writeTool(
    'unfollow_user',
    'Unfollow a user by their slug.',
    unfollowUserSchema,
    (args, mctx) => services.unfollowUser(args as UnfollowUserInput, mctx)
  );

  writeTool(
    'join_circle',
    'Join a circle by slug. Include invite_code if the circle requires one.',
    joinCircleSchema,
    (args, mctx) => services.joinCircle(args as JoinCircleInput, mctx)
  );

  writeTool(
    'leave_circle',
    'Leave a circle by slug.',
    leaveCircleSchema,
    (args, mctx) => services.leaveCircle(args as LeaveCircleInput, mctx)
  );

  // --- community:admin ----------------------------------------------------

  adminTool(
    'admin_list_users',
    'List users (admin). Optional query/role filter, paginated.',
    adminListUsersSchema,
    (args, mctx) => services.adminListUsers(args as AdminListUsersInput, mctx)
  );

  adminTool(
    'admin_get_user',
    'Get a user profile with activity, badges, memberships, and moderation history (admin).',
    adminGetUserSchema,
    (args, mctx) => services.adminGetUser(args as AdminGetUserInput, mctx)
  );

  adminTool(
    'admin_set_user_role',
    'Set a user role (member/moderator/admin). Audited.',
    adminSetUserRoleSchema,
    (args, mctx) => services.adminSetUserRole(args as AdminSetUserRoleInput, mctx)
  );

  adminTool(
    'admin_delete_user',
    'Delete a user (GDPR-anonymizes their data). Irreversible. Audited.',
    adminDeleteUserSchema,
    (args, mctx) => services.adminDeleteUser(args as AdminDeleteUserInput, mctx),
    { destructiveHint: true }
  );

  adminTool(
    'admin_list_groups',
    'List all circles (admin).',
    noInputSchema,
    (_args, mctx) => services.adminListGroups(mctx)
  );

  adminTool(
    'admin_create_group',
    'Create a circle. Audited.',
    adminCreateGroupSchema,
    (args, mctx) => services.adminCreateGroup(args as AdminCreateGroupInput, mctx)
  );

  adminTool(
    'admin_update_group',
    'Update a circle (name, description, color, visibility, tier, post approval, icon). Audited.',
    adminUpdateGroupSchema,
    (args, mctx) => services.adminUpdateGroup(args as AdminUpdateGroupInput, mctx)
  );

  adminTool(
    'admin_delete_group',
    'Delete a circle and cascade its posts/members. Irreversible. Audited.',
    adminDeleteGroupSchema,
    (args, mctx) => services.adminDeleteGroup(args as AdminDeleteGroupInput, mctx),
    { destructiveHint: true }
  );

  adminTool(
    'admin_update_settings',
    'Update a community settings section (merges values into the existing JSON). Audited.',
    adminUpdateSettingsSchema,
    (args, mctx) => services.adminUpdateSettings(args as AdminUpdateSettingsInput, mctx)
  );

  adminTool(
    'admin_award_points',
    'Manually award points to a user with a reason. Audited.',
    adminAwardPointsSchema,
    (args, mctx) => services.adminAwardPoints(args as AdminAwardPointsInput, mctx)
  );

  adminTool(
    'admin_list_badges',
    'List all badges (admin).',
    noInputSchema,
    (_args, mctx) => services.adminListBadges(mctx)
  );

  adminTool(
    'admin_create_badge',
    'Create a badge. Audited.',
    adminCreateBadgeSchema,
    (args, mctx) => services.adminCreateBadge(args as AdminCreateBadgeInput, mctx)
  );

  adminTool(
    'admin_award_badge',
    'Award a badge to a user by badge slug + user slug. Audited.',
    adminAwardBadgeSchema,
    (args, mctx) => services.adminAwardBadge(args as AdminAwardBadgeInput, mctx)
  );

  adminTool(
    'admin_list_watched_phrases',
    'List watched phrases (admin moderation catalog).',
    noInputSchema,
    (_args, mctx) => services.adminListWatchedPhrases(mctx)
  );

  adminTool(
    'admin_create_watched_phrase',
    'Create a watched phrase (optionally regex, optionally auto-flag). Audited.',
    adminCreateWatchedPhraseSchema,
    (args, mctx) =>
      services.adminCreateWatchedPhrase(args as AdminCreateWatchedPhraseInput, mctx)
  );

  adminTool(
    'admin_delete_watched_phrase',
    'Delete a watched phrase by id. Audited.',
    adminDeleteWatchedPhraseSchema,
    (args, mctx) =>
      services.adminDeleteWatchedPhrase(args as AdminDeleteWatchedPhraseInput, mctx),
    { destructiveHint: true }
  );

  adminTool(
    'admin_resolve_flag',
    'Resolve or dismiss a moderation flag. Audited.',
    adminResolveFlagSchema,
    (args, mctx) => services.adminResolveFlag(args as AdminResolveFlagInput, mctx)
  );

  adminTool(
    'admin_delete_flag',
    'Delete a moderation flag. Audited.',
    adminDeleteFlagSchema,
    (args, mctx) => services.adminDeleteFlag(args as AdminDeleteFlagInput, mctx),
    { destructiveHint: true }
  );

  adminTool(
    'admin_list_audit_logs',
    'List audit log entries (admin). Paginated with optional filters.',
    adminListAuditLogsSchema,
    (args, mctx) => services.adminListAuditLogs(args as AdminListAuditLogsInput, mctx)
  );

  adminTool(
    'admin_list_mcp_clients',
    'List registered MCP clients (admin).',
    noInputSchema,
    (_args, mctx) => services.adminListMcpClients(mctx)
  );

  adminTool(
    'admin_revoke_mcp_client',
    'Revoke (soft-disable) an MCP client by client id. Audited.',
    adminRevokeMcpClientSchema,
    (args, mctx) => services.adminRevokeMcpClient(args as AdminRevokeMcpClientInput, mctx)
  );
}

function toContext(authInfo?: AuthInfo): McpContext {
  if (!authInfo) {
    return { clientId: 'anonymous', scopes: [], token: '' };
  }
  return {
    clientId: authInfo.clientId,
    scopes: authInfo.scopes,
    token: authInfo.token,
    userId: typeof authInfo.extra?.userId === 'string' ? authInfo.extra.userId : undefined,
  };
}