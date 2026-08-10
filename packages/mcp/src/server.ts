import { McpServer, createMcpHandler, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server';
import { registerTools, type McpToolServices, type McpContext } from './tools';
import { registerResources, type McpResourceServices } from './resources';

/**
 * Minimal logger interface accepted by the MCP package. Any pino-compatible
 * logger can be passed in.
 */
export interface McpLogger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface CommunityMcpServerOptions {
  services: McpToolServices & McpResourceServices;
  logger: McpLogger;
}

/**
 * Build a fresh MCP server instance with the community read tools/resources
 * registered. v2's `createMcpHandler` runs this factory once per HTTP request,
 * so every request is served statelessly by its own server instance.
 */
export function createCommunityMcpServer(options: CommunityMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'operator-community', version: '0.1.0' },
    {
      instructions: 'Read-only MCP server for operator.promptmetrics.dev community data.',
    }
  );

  registerTools(server, options.services, options.logger);
  registerResources(server, options.services, options.logger);

  return server;
}

// v2's web-standard handler factory: returns `{ fetch }` where `fetch(request,
// { authInfo })` serves one HTTP request. Stateless by construction — each
// request gets a fresh `McpServer` from the factory. Legacy (2025-era)
// traffic is served via the stateless fallback (the default); GET/DELETE are
// answered with 405. Auth is pass-through: the caller verifies the token and
// hands the `AuthInfo` to `fetch`.
export { createMcpHandler, getOAuthProtectedResourceMetadataUrl };

export type { McpContext, McpToolServices, McpResourceServices };