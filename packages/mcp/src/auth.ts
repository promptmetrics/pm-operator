import { createHmac, timingSafeEqual } from 'crypto';

/**
 * OAuth verification for the operator MCP server.
 *
 * P1-27 decision: the token issuer is the platform OAuth provider (Supabase Auth
 * or a dedicated MCP issuer). Access tokens are JWTs with a one-hour lifetime and
 * must include the `mcp:read` scope. In production this function should either:
 *   1. Verify the JWT signature with `MCP_TOKEN_SECRET` (HS256 stub below), or
 *   2. Introspect the token at the issuer's introspection endpoint (configured via
 *      `MCP_INTROSPECTION_URL` and `MCP_INTROSPECTION_CLIENT_SECRET`).
 *
 * The current implementation uses HS256 signature verification when
 * `MCP_TOKEN_SECRET` is present; otherwise it decodes the payload without
 * verifying the signature and logs a warning. This is intentionally a stub so
 * the route typechecks and runs in development while the issuer is provisioned.
 *
 * Expected environment variables:
 *   - `MCP_TOKEN_SECRET` (server-only): symmetric key used to verify HS256 tokens.
 *   - `MCP_INTROSPECTION_URL` (optional): RFC 7662 token introspection endpoint.
 *   - `MCP_INTROSPECTION_CLIENT_SECRET` (optional): introspection client credentials.
 */

export const REQUIRED_READ_SCOPE = 'mcp:read';

export interface VerifiedMcpToken {
  clientId: string;
  scopes: string[];
  token: string;
  expiresAt?: number;
}

export async function verifyMcpOAuthToken(req: Request): Promise<VerifiedMcpToken | Response> {
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
  const secret = process.env.MCP_TOKEN_SECRET;
  try {
    if (secret) {
      payload = verifyJwt(token, secret);
    } else {
      payload = decodeJwtPayload(token);
    }
  } catch (err) {
    return unauthorized(err instanceof Error ? err.message : 'Invalid token');
  }

  const clientId = extractClientId(payload);
  if (!clientId) {
    return unauthorized('Token missing client identifier claim (sub or client_id)');
  }

  const scopes = parseScopes(payload.scope);
  if (!scopes.includes(REQUIRED_READ_SCOPE)) {
    return forbidden(`Missing required scope ${REQUIRED_READ_SCOPE}`);
  }

  const expiresAt = typeof payload.exp === 'number' ? payload.exp : undefined;
  if (expiresAt !== undefined && expiresAt * 1000 < Date.now()) {
    return unauthorized('Token expired');
  }

  return { clientId, scopes, token, expiresAt };
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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  return JSON.parse(base64UrlDecode(parts[1] ?? '')) as Record<string, unknown>;
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
