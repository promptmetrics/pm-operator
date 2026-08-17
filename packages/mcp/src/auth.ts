import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
} from '@modelcontextprotocol/server';

/**
 * OAuth verification for the operator MCP server.
 *
 * Access tokens are JWTs signed with HS256 using `MCP_TOKEN_SECRET` and must
 * include the `community:read` scope. Tokens are expected to carry:
 *   - `iss`: 'operator.promptmetrics.dev'
 *   - `aud`: 'operator.promptmetrics.dev/mcp'
 *   - `sub` or `client_id`: registered MCP client ID
 *   - `scope`: space-separated OAuth scopes (array form also accepted)
 *   - `exp`: REQUIRED (seconds since epoch) — 2026-07-28 / OAuth 2.1 want
 *     short-lived tokens; a token without `exp` is rejected.
 *   - optional `user_id`: acting user to attribute to agent_actions
 *
 * When `lookupClient` is provided, the client ID is validated against the
 * `mcp_clients` table: the client must be active and the token's scopes are
 * intersected with the client's allowed scopes.
 *
 * `resourceMetadataUrl`, when provided, is advertised in the `WWW-Authenticate`
 * challenge via RFC 9728 Protected Resource Metadata so a 2026-07-28 client
 * can discover the resource.
 */

export const TOKEN_ISSUER = 'operator.promptmetrics.dev';
export const TOKEN_AUDIENCE = 'operator.promptmetrics.dev/mcp';
export const REQUIRED_READ_SCOPE = 'community:read';
export const REQUIRED_WRITE_SCOPE = 'community:write';
export const REQUIRED_ADMIN_SCOPE = 'community:admin';

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
  /** RFC 9728 metadata URL advertised on 401/403 challenges. */
  resourceMetadataUrl?: string;
}

export interface SignMcpTokenOptions {
  clientId: string;
  scopes: string[];
  /** Bound user id (public.users.id). Omit for read-only tokens. */
  userId?: string;
  /** Access-token lifetime in seconds. */
  ttlSeconds: number;
  /** Defaults to process.env.MCP_TOKEN_SECRET. */
  secret?: string;
  /** Issued-at in seconds; defaults to now. */
  iat?: number;
}

export async function verifyMcpOAuthToken(
  req: Request,
  options: McpAuthOptions = {}
): Promise<VerifiedMcpToken | Response> {
  const { lookupClient, resourceMetadataUrl } = options;
  const challenge = (error: OAuthError) =>
    bearerAuthChallengeResponse(error, { resourceMetadataUrl });

  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    // Server misconfiguration, not a bad request — 500, no client challenge.
    return challenge(new OAuthError(OAuthErrorCode.ServerError, 'MCP_TOKEN_SECRET not configured'));
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Missing Authorization header'));
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Authorization header must be Bearer token'));
  }
  const token = match[1];

  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(token, secret);
  } catch (err) {
    return challenge(
      new OAuthError(OAuthErrorCode.InvalidToken, err instanceof Error ? err.message : 'Invalid token')
    );
  }

  const clientId = extractClientId(payload);
  if (!clientId) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Token missing client identifier claim (sub or client_id)'));
  }

  if (payload.iss !== TOKEN_ISSUER) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token issuer'));
  }

  if (payload.aud !== TOKEN_AUDIENCE) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token audience'));
  }

  // exp is REQUIRED (2026-07-28 / OAuth 2.1). A token without a numeric exp is
  // rejected; one in the past is expired.
  if (typeof payload.exp !== 'number') {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Token missing required exp claim'));
  }
  if (payload.exp * 1000 < Date.now()) {
    return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Token expired'));
  }

  let scopes = parseScopes(payload.scope);

  if (lookupClient) {
    const client = await lookupClient(clientId);
    if (!client || !client.isActive) {
      // An unknown/disabled client means the token is invalid for this
      // resource server — treat it as invalid_token (401 + challenge) so the
      // RFC 9728 resource_metadata discovery hook still fires.
      return challenge(new OAuthError(OAuthErrorCode.InvalidToken, 'Client not registered or inactive'));
    }
    scopes = scopes.filter((scope) => client.scopes.includes(scope));
  }

  if (!scopes.includes(REQUIRED_READ_SCOPE)) {
    return challenge(
      new OAuthError(OAuthErrorCode.InsufficientScope, `Missing required scope ${REQUIRED_READ_SCOPE}`)
    );
  }

  const userId =
    typeof payload.user_id === 'string' && payload.user_id.length > 0
      ? payload.user_id
      : undefined;

  return { clientId, scopes, token, expiresAt: payload.exp, userId };
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

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Mint an HS256 access token in the exact claim shape `verifyMcpOAuthToken`
 * accepts. This is the sign counterpart to `verifyJwt` — the Authorization
 * Server's `/token` endpoint uses it to issue tokens the existing MCP route
 * verifies unchanged.
 *
 * The signer is deliberately dumb: it does NOT enforce write/admin
 * user-binding or role checks. The `/token` route narrows scopes by the bound
 * user's role before calling this; double-gating here would duplicate that.
 *
 * Claims (must match scripts/manage-mcp-clients.mjs byte-for-byte):
 *   - iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, sub: clientId
 *   - scope: scopes.join(' ') (parseScopes splits on /\s+/)
 *   - iat, exp (seconds), jti (random; enables a future denylist)
 *   - user_id: only when a non-empty userId is passed
 */
export function signMcpToken(options: SignMcpTokenOptions): string {
  const { clientId, scopes, userId, ttlSeconds } = options;
  const secret = options.secret ?? process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    throw new Error('signMcpToken: MCP_TOKEN_SECRET is not configured');
  }
  if (scopes.length === 0) {
    throw new Error('signMcpToken: at least one scope is required');
  }
  if (!scopes.includes(REQUIRED_READ_SCOPE)) {
    throw new Error(`signMcpToken: every token must include ${REQUIRED_READ_SCOPE}`);
  }

  const iat = options.iat ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    sub: clientId,
    scope: scopes.join(' '),
    iat,
    exp: iat + ttlSeconds,
    jti: randomUUID(),
  };
  if (typeof userId === 'string' && userId.length > 0) {
    payload.user_id = userId;
  }

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}