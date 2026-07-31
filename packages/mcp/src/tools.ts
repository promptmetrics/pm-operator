import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpLogger } from './server';

export interface McpContext {
  clientId: string;
  scopes: string[];
  token: string;
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
  period: z.enum(['weekly', 'monthly', 'quarterly', 'all_time']).default('all_time'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ListLeaderboardsInput = z.infer<typeof listLeaderboardsSchema>;

export const summarizeThreadSchema = z.object({
  post_id: z.string().uuid(),
  max_length: z.number().int().min(50).max(2000).default(300),
});

export type SummarizeThreadInput = z.infer<typeof summarizeThreadSchema>;

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
      inputSchema: searchPostsSchema.shape,
    },
    async (args, extra) => {
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, tool: 'search_posts' }, 'search_posts');
      try {
        const result = await services.searchPosts(args, ctx);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        logger.error({ err, clientId: ctx.clientId, tool: 'search_posts' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'get_user_profile',
    {
      description: 'Return a public user profile, reputation, badges, and top circles.',
      inputSchema: getUserProfileSchema.shape,
    },
    async (args, extra) => {
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, tool: 'get_user_profile' }, 'get_user_profile');
      try {
        const result = await services.getUserProfile(args, ctx);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        logger.error({ err, clientId: ctx.clientId, tool: 'get_user_profile' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'list_leaderboards',
    {
      description: 'Return a leaderboard. Use empty group_slug for global.',
      inputSchema: listLeaderboardsSchema.shape,
    },
    async (args, extra) => {
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, tool: 'list_leaderboards' }, 'list_leaderboards');
      try {
        const result = await services.listLeaderboards(args, ctx);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load leaderboard';
        logger.error({ err, clientId: ctx.clientId, tool: 'list_leaderboards' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );

  server.registerTool(
    'summarize_thread',
    {
      description:
        'Summarize a post and its comments. Heavy tool; may return a job URI if >2s.',
      inputSchema: summarizeThreadSchema.shape,
    },
    async (args, extra) => {
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, tool: 'summarize_thread' }, 'summarize_thread');
      try {
        const result = await services.summarizeThread(args, ctx);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to summarize thread';
        logger.error({ err, clientId: ctx.clientId, tool: 'summarize_thread' }, message);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    }
  );
}

function toContext(authInfo?: {
  clientId: string;
  scopes: string[];
  token: string;
}): McpContext {
  if (!authInfo) {
    return { clientId: 'anonymous', scopes: [], token: '' };
  }
  return {
    clientId: authInfo.clientId,
    scopes: authInfo.scopes,
    token: authInfo.token,
  };
}
