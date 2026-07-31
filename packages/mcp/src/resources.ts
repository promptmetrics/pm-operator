import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpLogger } from './server';
import type { McpContext } from './tools';

export type McpResourceQuery = { groupSlug?: string; period?: string };

export interface McpResourceServices {
  getUserProfileBySlug(
    slug: string,
    ctx: McpContext,
    query?: McpResourceQuery
  ): Promise<unknown>;
  getGroupBySlug(
    slug: string,
    ctx: McpContext,
    query?: McpResourceQuery
  ): Promise<unknown>;
  getPostById(
    id: string,
    ctx: McpContext,
    query?: McpResourceQuery
  ): Promise<unknown>;
  getLeaderboard(
    type: string,
    ctx: McpContext,
    query?: McpResourceQuery
  ): Promise<unknown>;
}

export function registerResources(
  server: McpServer,
  services: McpResourceServices,
  logger: McpLogger
): void {
  server.registerResource(
    'user_profile',
    'community://users/{slug}',
    {
      description: 'Public profile for a community member.',
      mimeType: 'application/json',
    },
    async (uri, extra) => {
      const slug = uri.pathname.split('/').pop() ?? '';
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, resource: 'user_profile', slug }, 'read user');
      const result = await services.getUserProfileBySlug(slug, ctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  server.registerResource(
    'group',
    'community://groups/{slug}',
    {
      description: 'Community circle metadata and visibility.',
      mimeType: 'application/json',
    },
    async (uri, extra) => {
      const slug = uri.pathname.split('/').pop() ?? '';
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, resource: 'group', slug }, 'read group');
      const result = await services.getGroupBySlug(slug, ctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  server.registerResource(
    'post',
    'community://posts/{id}',
    {
      description: 'Community post detail, including title and plain content.',
      mimeType: 'application/json',
    },
    async (uri, extra) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const ctx = toContext(extra.authInfo);
      logger.debug({ clientId: ctx.clientId, resource: 'post', id }, 'read post');
      const result = await services.getPostById(id, ctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  const leaderboardTemplate = new ResourceTemplate(
    'community://leaderboards/{type}{?group_slug,period}',
    { list: undefined }
  );

  server.registerResource(
    'leaderboard',
    leaderboardTemplate,
    {
      description: 'Leaderboard for a specific type, period and optional group.',
      mimeType: 'application/json',
    },
    async (uri, variables, extra) => {
      const type = toSingle(variables.type) ?? '';
      const ctx = toContext(extra.authInfo);
      logger.debug(
        { clientId: ctx.clientId, resource: 'leaderboard', type, variables },
        'read leaderboard'
      );
      const result = await services.getLeaderboard(type, ctx, {
        groupSlug: toSingle(variables.group_slug),
        period: toSingle(variables.period),
      });
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
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

function toSingle(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
