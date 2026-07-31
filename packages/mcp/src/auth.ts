import { createHmac, timingSafeEqual } from 'crypto';

/**
 * OAuth verification for the operator MCP server.
 *
 * Access tokens are JWTs signed with HS256 using `MCP_TOKEN_SECRET` and must
 * include the `community:read` scope. Tokens are expected to carry:
 *   - `iss`: 'operator.promptmetrics.dev'
 *   - `aud`: 'operator.promptmetrics.dev/mcp'
 *   - `sub` or `client_id`: registered MCP client ID
 *   - `scope`: space-separated OAuth scopes
 *   - optional `user_id`: acting user to attribute to agent_actions
 *
 * When `lookupClient` is provided, the client ID is validated against the
 * `mcp_clients` table: the client must be active and the token's scopes are
 * intersected with the client's allowed scopes.
 */

export const TOKEN_ISSUER = 'operator.promptmetrics.dev';
export const TOKEN_AUDIENCE = 'operator.promptmetrics.dev/mcp';
export const REQUIRED_READ_SCOPE = 'community:read';

export interface VerifiedMcpToken {
  clientId: string;
  scopes: string[];
  token: string;
  expiresAt?: number;
  userId?: string;
}

export interface McpClientInfo {
  clientId: string;
  scopes: string[];
  isActive: boolean;
}

export type LookupMcpClient = (clientId: string) => Promise<McpClientInfo | null | undefined | void>;

export interface McpAuthOptions {
  lookupClient?: LookupMcpClient;
}

export async function verifyMcpOAuthToken(
  req: Request,
  options: McpAuthOptions = {}
): Promise<VerifiedMcpToken | Response> {
  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    return unauthorized('MCP_TOKEN_SECRET not configured');
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return unauthorized('Missing Authorization header');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return unauthorized('Authorization header must be Bearer token');
  }
  const token = match[1];

  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(token, secret);
  } catch (err) {
    return unauthorized(err instanceof Error ? err.message : 'Invalid token');
  }

  const clientId = extractClientId(payload);
  if (!clientId) {
    return unauthorized('Token missing client identifier claim (sub or client_id)');
  }

  if (payload.iss !== TOKEN_ISSUER) {
    return unauthorized('Invalid token issuer');
  }

  if (payload.aud !== TOKEN_AUDIENCE) {
    return unauthorized('Invalid token audience');
  }

  const expiresAt = typeof payload.exp === 'number' ? payload.exp : undefined;
  if (expiresAt !== undefined && expiresAt * 1000 < Date.now()) {
    return unauthorized('Token expired');
  }

  let scopes = parseScopes(payload.scope);

  if (options.lookupClient) {
    const client = await options.lookupClient(clientId);
    if (!client || !client.isActive) {
      return forbidden('Client not registered or inactive');
    }
    scopes = scopes.filter((scope) => client.scopes.includes(scope));
  }

  if (!scopes.includes(REQUIRED_READ_SCOPE)) {
    return forbidden(`Missing required scope ${REQUIRED_READ_SCOPE}`);
  }

  const userId =
    typeof payload.user_id === 'string' && payload.user_id.length > 0
      ? payload.user_id
      : undefined;

  return { clientId, scopes, token, expiresAt, userId };
}

function unauthorized(message: string): Response {
  return new Response(`Unauthorized: ${message}`, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

function forbidden(message: string): Response {
  return new Response(`Forbidden: ${message}`, { status: 403 });
}

function extractClientId(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.sub === 'string' && payload.sub.length > 0) return payload.sub;
  if (typeof payload.client_id === 'string' && payload.client_id.length > 0) return payload.client_id;
  return undefined;
}

function parseScopes(scope: unknown): string[] {
  if (typeof scope === 'string') return scope.split(/\s+/).filter(Boolean);
  if (Array.isArray(scope)) return scope.filter((s): s is string => typeof s === 'string');
  return [];
}

function base64UrlDecode(value: string): string {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + padding, 'base64').toString(
    'utf8'
  );
}

function verifyJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64 ?? '')) as { alg?: string };
  if (header.alg !== 'HS256') {
    throw new Error(`Unsupported JWT algorithm ${header.alg ?? '(none)'}`);
  }

  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  const actual = Buffer.from(signatureB64 ?? '', 'base64url');
  const expectedBuf = Buffer.from(expected, 'base64url');

  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    throw new Error('Invalid JWT signature');
  }

  return JSON.parse(base64UrlDecode(payloadB64 ?? '')) as Record<string, unknown>;
}
