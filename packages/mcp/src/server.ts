import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools, type McpToolServices, type McpContext } from './tools';
import { registerResources, type McpResourceServices } from './resources';
import type { VerifiedMcpToken } from './auth';

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

export function createCommunityMcpServer(options: CommunityMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'operator-community', version: '0.1.0' },
    {
      instructions: 'Read-only MCP server for operator.promptmetrics.dev community data.',
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
    }
  );

  registerTools(server, options.services, options.logger);
  registerResources(server, options.services, options.logger);

  return server;
}

export interface McpHandlerConfig {
  server: McpServer;
  /**
   * Declared for forward compatibility with MCP protocol negotiation.
   * The underlying SDK handles version exchange during initialization.
   */
  supportedProtocolVersions?: string[];
  auth: {
    verify: (req: Request) => Promise<Omit<VerifiedMcpToken, 'expiresAt'> | Response>;
  };
}

export function createMcpHandler(config: McpHandlerConfig): (req: Request) => Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  let connectPromise: Promise<void> | null = null;

  function ensureConnected(): Promise<void> {
    if (!connectPromise) {
      connectPromise = config.server.connect(transport).catch((err) => {
        connectPromise = null;
        throw err;
      });
    }
    return connectPromise;
  }

  return async function handle(req: Request): Promise<Response> {
    await ensureConnected();

    const auth = await config.auth.verify(req);
    if (auth instanceof Response) {
      return auth;
    }

    return transport.handleRequest(req, {
      authInfo: {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
      },
    });
  };
}

export type { McpContext, McpToolServices, McpResourceServices };
