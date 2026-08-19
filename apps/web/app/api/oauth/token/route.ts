import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { signMcpToken } from '@pm-operator/mcp';
import { createServiceDb } from '@/lib/db';
import { adminCreateAuditLog } from '@/lib/services/admin';
import {
  ACCESS_TOKEN_TTL_S,
  REFRESH_TOKEN_TTL_S,
  CORS_HEADERS,
  requireMcpEnabled,
} from '@/lib/oauth/constants';
import { verifyCodeVerifier } from '@/lib/oauth/pkce';
import { sha256Hex, createRefreshToken, verifyClientSecret } from '@/lib/oauth/codes';
import { lookupClientByClientId, type McpClientRow } from '@/lib/oauth/client';
import { narrowGrantedScopes, parseScope } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createServiceDb();

// OAuth 2.1 token endpoint. Issues the HS256 access tokens the MCP resource
// server (/api/mcp) already verifies — via signMcpToken, so verification side
// stays unchanged. Two grants: authorization_code (with PKCE) and refresh_token
// (rotation + reuse detection). Audit emits mcp_token_issue; an audit failure is
// caught so it never un-issues a token.
export async function POST(req: Request) {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    return oauthError(500, 'server_error', 'MCP_TOKEN_SECRET not configured');
  }

  const params = await parseTokenRequest(req);
  const grantType = params.grant_type ?? '';

  // TEMP DIAGNOSTIC — remove once the confidential-client token-exchange
  // failure is resolved. Records the request shape with NO secret values.
  console.error('[oauth/token] request', {
    grant_type: grantType,
    has_code: !!params.code,
    has_redirect_uri: !!params.redirect_uri,
    has_client_id: !!params.client_id,
    has_client_secret: !!params.client_secret,
    has_code_verifier: !!params.code_verifier,
    has_auth_header: !!req.headers.get('authorization'),
    content_type: req.headers.get('content-type'),
  });

  if (grantType === 'authorization_code') {
    return authorizationCodeGrant(params, secret);
  }
  if (grantType === 'refresh_token') {
    return refreshTokenGrant(params, secret);
  }
  return oauthError(400, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported.');
}

async function authorizationCodeGrant(params: Record<string, string>, secret: string): Promise<NextResponse> {
  const code = params.code ?? '';
  const redirectUri = params.redirect_uri ?? '';
  const clientIdText = params.client_id ?? '';
  const codeVerifier = params.code_verifier ?? '';

  if (!code || !redirectUri || !clientIdText || !codeVerifier) {
    console.error('[oauth/token] invalid_request_missing_params', { has_code: !!code, has_redirect_uri: !!redirectUri, has_client_id: !!clientIdText, has_code_verifier: !!codeVerifier });
    return oauthError(400, 'invalid_request', 'code, redirect_uri, client_id, and code_verifier are required.');
  }

  const codeRows = await db
    .select()
    .from(schema.oauthAuthorizationCodes)
    .where(eq(schema.oauthAuthorizationCodes.codeHash, sha256Hex(code)))
    .limit(1);
  const codeRow = codeRows[0];
  if (!codeRow) {
    console.error('[oauth/token] invalid_grant_code_not_found');
    return oauthError(400, 'invalid_grant', 'Authorization code not found.');
  }

  // Replay of a used code → revoke the user's refresh chain for this client.
  if (codeRow.used) {
    console.error('[oauth/token] invalid_grant_code_used');
    await revokeRefreshChain(codeRow.clientId, codeRow.userId);
    return oauthError(400, 'invalid_grant', 'Authorization code already used.');
  }
  if (codeRow.expiresAt.getTime() < Date.now()) {
    console.error('[oauth/token] invalid_grant_code_expired');
    return oauthError(400, 'invalid_grant', 'Authorization code expired.');
  }

  const client = await lookupClientByClientId(db, clientIdText);
  if (!client || !client.isActive) {
    console.error('[oauth/token] client_not_found_or_inactive', { client_id: clientIdText, found: !!client, active: client?.isActive });
    return oauthError(400, 'invalid_grant', 'Client does not match the authorization code.');
  }
  const authFailure = authenticateClient(client, params);
  if (authFailure) return authFailure;
  if (client.id !== codeRow.clientId) {
    console.error('[oauth/token] client_mismatch', { sent_client_dbid: client.id, code_client_dbid: codeRow.clientId });
    return oauthError(400, 'invalid_grant', 'Client does not match the authorization code.');
  }
  if (redirectUri !== codeRow.redirectUri) {
    console.error('[oauth/token] redirect_uri_mismatch', { sent: redirectUri, stored: codeRow.redirectUri });
    return oauthError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
  }
  if (!verifyCodeVerifier(codeVerifier, codeRow.codeChallenge, codeRow.codeChallengeMethod)) {
    console.error('[oauth/token] pkce_fail', { challenge_method: codeRow.codeChallengeMethod, verifier_len: codeVerifier.length, stored_challenge_len: (codeRow.codeChallenge ?? '').length });
    return oauthError(400, 'invalid_grant', 'PKCE verification failed.');
  }

  // Re-narrow scope by the user's current role (handles a role change in the
  // 120s code window).
  const role = await loadUserRole(codeRow.userId);
  const grantedScopes = narrowGrantedScopes(codeRow.scope, client.scopes, role === 'admin');

  const refresh = createRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000);

  // Atomically claim the code (guard used=false) and insert the refresh token.
  // A 0-row update means a concurrent request used the code first → revoke.
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.oauthAuthorizationCodes)
        .set({ used: true })
        .where(and(eq(schema.oauthAuthorizationCodes.id, codeRow.id), eq(schema.oauthAuthorizationCodes.used, false)))
        .returning({ id: schema.oauthAuthorizationCodes.id });
      if (claimed.length === 0) {
        throw new CodeReplayError();
      }
      await tx.insert(schema.oauthRefreshTokens).values({
        tokenHash: refresh.hash,
        clientId: client.id,
        userId: codeRow.userId,
        scope: grantedScopes,
        expiresAt: refreshExpiresAt,
        used: false,
      });
    });
  } catch (err) {
    if (err instanceof CodeReplayError) {
      await revokeRefreshChain(codeRow.clientId, codeRow.userId);
      return oauthError(400, 'invalid_grant', 'Authorization code already used.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[oauth/token] server_error', { msg });
    return oauthError(500, 'server_error', `Token issuance failed: ${msg}`);
  }

  const accessToken = signMcpToken({
    clientId: client.clientId,
    scopes: grantedScopes,
    userId: codeRow.userId,
    ttlSeconds: ACCESS_TOKEN_TTL_S,
    secret,
  });

  auditIssue(codeRow.userId, client.id, grantedScopes, 'authorization_code');

  console.error('[oauth/token] success', { grant_type: 'authorization_code', scopes: grantedScopes });
  return tokenResponse(accessToken, grantedScopes, refresh.raw);
}

async function refreshTokenGrant(params: Record<string, string>, secret: string): Promise<NextResponse> {
  const refreshToken = params.refresh_token ?? '';
  const clientIdText = params.client_id ?? '';
  if (!refreshToken || !clientIdText) {
    return oauthError(400, 'invalid_request', 'refresh_token and client_id are required.');
  }

  const tokenRows = await db
    .select()
    .from(schema.oauthRefreshTokens)
    .where(eq(schema.oauthRefreshTokens.tokenHash, sha256Hex(refreshToken)))
    .limit(1);
  const tokenRow = tokenRows[0];
  if (!tokenRow) {
    return oauthError(400, 'invalid_grant', 'Refresh token not found.');
  }

  // Reuse detection: a used token presented again means the chain was
  // compromised → revoke every active refresh token for this client+user.
  if (tokenRow.used) {
    await revokeRefreshChain(tokenRow.clientId, tokenRow.userId);
    return oauthError(400, 'invalid_grant', 'Refresh token reuse detected; all tokens revoked.');
  }
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    return oauthError(400, 'invalid_grant', 'Refresh token expired.');
  }

  const client = await lookupClientByClientId(db, clientIdText);
  if (!client || !client.isActive) {
    return oauthError(400, 'invalid_grant', 'Client does not match the refresh token.');
  }
  const authFailure = authenticateClient(client, params);
  if (authFailure) return authFailure;
  if (client.id !== tokenRow.clientId) {
    return oauthError(400, 'invalid_grant', 'Client does not match the refresh token.');
  }

  const role = await loadUserRole(tokenRow.userId);
  // RFC 6749 §6: a requested scope on refresh must be a subset of the original.
  const requested = parseScope(params.scope);
  const tokenConstrainedClientScopes = client.scopes.filter((s) => tokenRow.scope.includes(s));
  const grantedScopes = narrowGrantedScopes(
    requested.length > 0 ? requested : tokenRow.scope,
    tokenConstrainedClientScopes,
    role === 'admin',
  );

  const newRefresh = createRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000);

  // Atomically rotate: claim the old token (guard used=false) and insert the
  // new one, then link the old → new via rotatedTo. A 0-row claim is reuse.
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.oauthRefreshTokens)
        .set({ used: true })
        .where(and(eq(schema.oauthRefreshTokens.id, tokenRow.id), eq(schema.oauthRefreshTokens.used, false)))
        .returning({ id: schema.oauthRefreshTokens.id });
      if (claimed.length === 0) {
        throw new CodeReplayError();
      }
      const inserted = await tx
        .insert(schema.oauthRefreshTokens)
        .values({
          tokenHash: newRefresh.hash,
          clientId: client.id,
          userId: tokenRow.userId,
          scope: grantedScopes,
          expiresAt: refreshExpiresAt,
          used: false,
        })
        .returning({ id: schema.oauthRefreshTokens.id });
      await tx
        .update(schema.oauthRefreshTokens)
        .set({ rotatedTo: inserted[0]!.id })
        .where(eq(schema.oauthRefreshTokens.id, tokenRow.id));
    });
  } catch (err) {
    if (err instanceof CodeReplayError) {
      await revokeRefreshChain(tokenRow.clientId, tokenRow.userId);
      return oauthError(400, 'invalid_grant', 'Refresh token reuse detected; all tokens revoked.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    return oauthError(500, 'server_error', `Token refresh failed: ${msg}`);
  }

  const accessToken = signMcpToken({
    clientId: client.clientId,
    scopes: grantedScopes,
    userId: tokenRow.userId,
    ttlSeconds: ACCESS_TOKEN_TTL_S,
    secret,
  });

  auditIssue(tokenRow.userId, client.id, grantedScopes, 'refresh_token');

  return tokenResponse(accessToken, grantedScopes, newRefresh.raw);
}

async function loadUserRole(userId: string): Promise<string | null> {
  const rows = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.role ?? null;
}

// Revoke every still-active refresh token for a client+user. Used on auth-code
// replay and refresh-token reuse (the OAuth 2.1 automatic-rotation response to
// a compromised chain).
async function revokeRefreshChain(clientId: string, userId: string): Promise<void> {
  await db
    .update(schema.oauthRefreshTokens)
    .set({ used: true })
    .where(
      and(
        eq(schema.oauthRefreshTokens.clientId, clientId),
        eq(schema.oauthRefreshTokens.userId, userId),
        eq(schema.oauthRefreshTokens.used, false),
      ),
    );
}

function auditIssue(actorId: string, clientId: string, scopes: string[], grantType: string): void {
  // Best-effort: an audit failure must not un-issue the token.
  adminCreateAuditLog(db, {
    actorId,
    action: 'mcp_token_issue',
    targetType: 'mcp_client',
    targetId: clientId,
    details: { scopes, grant_type: grantType },
  }).catch(() => {
    // Intentionally swallowed — see comment above.
  });
}

function tokenResponse(accessToken: string, scopes: string[], refreshToken: string): NextResponse {
  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      scope: scopes.join(' '),
      refresh_token: refreshToken,
    },
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

async function parseTokenRequest(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const json = (await req.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
    }
    return out;
  }
  const form = await req.formData();
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    out[k] = String(v);
  });
  return out;
}

function oauthError(status: number, error: string, description: string): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

// Confidential-client authentication at the token endpoint. Public 'none'
// clients (tokenEndpointAuthMethod null or 'none') authenticate via PKCE alone;
// a spurious client_secret from them is ignored. Confidential
// 'client_secret_post' clients must present client_secret, verified timing-safe
// against the stored sha256 hash. Failure is 401 invalid_client (RFC 6749 §5.2);
// no WWW-Authenticate header — client_secret_post has no registered HTTP auth
// scheme, so a challenge header would mislead toward Basic.
function authenticateClient(client: McpClientRow, params: Record<string, string>): NextResponse | null {
  if (client.tokenEndpointAuthMethod !== 'client_secret_post') {
    return null;
  }
  const presented = params.client_secret ?? '';
  if (!verifyClientSecret(presented, client.clientSecret)) {
    console.error('[oauth/token] invalid_client', { auth_method: client.tokenEndpointAuthMethod, presented_secret_len: presented.length, stored_secret_present: !!client.clientSecret });
    return oauthError(401, 'invalid_client', 'Client authentication failed.');
  }
  return null;
}

class CodeReplayError extends Error {
  constructor() {
    super('code or refresh token already used (concurrent replay)');
  }
}