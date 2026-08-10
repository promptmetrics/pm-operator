import 'server-only';

import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { Logger } from 'pino';
import type {
  McpToolServices,
  McpResourceServices,
  McpContext,
  SearchPostsInput,
  GetUserProfileInput,
  ListLeaderboardsInput,
  SummarizeThreadInput,
} from '@pm-operator/mcp';
import type { SearchQuery } from '@pm-operator/api';
import { searchPosts as searchPostsService } from './search';
import { getUserProfile as getUserProfileService } from './users';
import { getGroupBySlug } from './groups';
import { listGlobalLeaderboard, listGroupLeaderboard } from './community';
import { getPostById } from './posts';
import { listCommentsForPost } from './comments';

type McpServices = McpToolServices & McpResourceServices;

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
  };

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
