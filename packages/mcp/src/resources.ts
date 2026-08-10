import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { AuthInfo, Variables } from '@modelcontextprotocol/server';
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
  // All four resources are URI templates. v2's `registerResource` treats a
  // plain string URI as a *static* resource keyed by the literal string
  // (braces included), so it would never match a concrete read URI. Passing a
  // `ResourceTemplate` instance registers a matchable template instead.
  server.registerResource(
    'user_profile',
    new ResourceTemplate('community://users/{slug}', { list: undefined }),
    {
      description: 'Public profile for a community member.',
      mimeType: 'application/json',
    },
    async (uri, variables: Variables, ctx) => {
      const slug = toSingle(variables.slug) ?? '';
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, resource: 'user_profile', slug }, 'read user');
      const result = await services.getUserProfileBySlug(slug, mctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  server.registerResource(
    'group',
    new ResourceTemplate('community://groups/{slug}', { list: undefined }),
    {
      description: 'Community circle metadata and visibility.',
      mimeType: 'application/json',
    },
    async (uri, variables: Variables, ctx) => {
      const slug = toSingle(variables.slug) ?? '';
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, resource: 'group', slug }, 'read group');
      const result = await services.getGroupBySlug(slug, mctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  server.registerResource(
    'post',
    new ResourceTemplate('community://posts/{id}', { list: undefined }),
    {
      description: 'Community post detail, including title and plain content.',
      mimeType: 'application/json',
    },
    async (uri, variables: Variables, ctx) => {
      const id = toSingle(variables.id) ?? '';
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug({ clientId: mctx.clientId, resource: 'post', id }, 'read post');
      const result = await services.getPostById(id, mctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
    }
  );

  server.registerResource(
    'leaderboard',
    new ResourceTemplate('community://leaderboards/{type}', { list: undefined }),
    {
      description: 'Canonical all-time leaderboard for a type (global or group). Use the list_leaderboards tool for period- or group-specific queries.',
      mimeType: 'application/json',
    },
    async (uri, variables: Variables, ctx) => {
      const type = toSingle(variables.type) ?? '';
      const mctx = toContext(ctx.http?.authInfo);
      logger.debug(
        { clientId: mctx.clientId, resource: 'leaderboard', type, variables },
        'read leaderboard'
      );
      // No query vars: the resource is the canonical all_time view for a type.
      // The SDK's UriTemplate.match can't reverse-match an absent `{?...}` query
      // (it treats optional query expansion as required in the match regex), so
      // period/group are not addressable here — use the list_leaderboards tool.
      const result = await services.getLeaderboard(type, mctx);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) }] };
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

function toSingle(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}