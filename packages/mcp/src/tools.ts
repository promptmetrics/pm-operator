import { McpServer } from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { McpLogger } from './server';

export interface McpContext {
  clientId: string;
  scopes: string[];
  token: string;
  userId?: string;
}

export interface McpToolServices {
  searchPosts(input: SearchPostsInput, ctx: McpContext): Promise<unknown>;
  getUserProfile(input: GetUserProfileInput, ctx: McpContext): Promise<unknown>;
  listLeaderboards(input: ListLeaderboardsInput, ctx: McpContext): Promise<unknown>;
  summarizeThread(input: SummarizeThreadInput, ctx: McpContext): Promise<unknown>;
}

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

// --- Output schemas (2026-07-28 structuredContent) -----------------------
// These mirror the service return shapes in apps/web/lib/services/mcp.ts,
// kept deliberately permissive (z.string()/z.number() over tight enums) so
// the structured payload validates without coupling MCP to the REST API's
// zod v3 contract schemas.

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

export function registerTools(
  server: McpServer,
  services: McpToolServices,
  logger: McpLogger
): void {
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