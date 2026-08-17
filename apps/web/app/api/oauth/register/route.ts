import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import {
  KNOWN_SCOPES,
  CORS_HEADERS,
  requireMcpEnabled,
} from '@/lib/oauth/constants';
import { isValidRegistrationRedirectUri } from '@/lib/oauth/redirect-uri';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createServiceDb();

const ALLOWED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token']);
const DEFAULT_GRANT_TYPES = ['authorization_code', 'refresh_token'];

// RFC 7591 Dynamic Client Registration. Public PKCE clients only —
// token_endpoint_auth_method must be 'none' (no client_secret is issued);
// confidential methods are rejected. redirect_uris is required; each must be
// https or http loopback (RFC 8252). Requested scopes are intersected with the
// known set and community:read is forced. DCR is pre-auth/public, so it is not
// audited — created_via='dcr' on the row is the registration record.
export async function POST(req: Request) {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'Request body must be JSON');
  }

  const clientName = nonEmptyString(body.client_name) ?? 'MCP Client';

  const redirectUrisRaw = body.redirect_uris;
  if (!Array.isArray(redirectUrisRaw) || redirectUrisRaw.length === 0) {
    return oauthError(400, 'invalid_client_metadata', 'redirect_uris is required and must be a non-empty array');
  }
  const redirectUris = redirectUrisRaw.filter((u): u is string => typeof u === 'string');
  if (redirectUris.length !== redirectUrisRaw.length) {
    return oauthError(400, 'invalid_client_metadata', 'redirect_uris must be strings');
  }
  for (const uri of redirectUris) {
    if (!isValidRegistrationRedirectUri(uri)) {
      return oauthError(400, 'invalid_client_metadata', `redirect_uri must be https or http loopback: ${uri}`);
    }
  }

  const tokenAuthMethod = nonEmptyString(body.token_endpoint_auth_method) ?? 'none';
  if (tokenAuthMethod !== 'none') {
    return oauthError(
      400,
      'invalid_client_metadata',
      'token_endpoint_auth_method must be "none" (public PKCE clients only)',
    );
  }

  let grantTypes = DEFAULT_GRANT_TYPES;
  const grantTypesRaw = body.grant_types;
  if (grantTypesRaw !== undefined) {
    if (!Array.isArray(grantTypesRaw) || grantTypesRaw.length === 0) {
      return oauthError(400, 'invalid_client_metadata', 'grant_types must be a non-empty array');
    }
    grantTypes = grantTypesRaw.filter((g): g is string => typeof g === 'string');
    if (grantTypes.some((g) => !ALLOWED_GRANT_TYPES.has(g))) {
      return oauthError(400, 'invalid_client_metadata', 'grant_types must be within [authorization_code, refresh_token]');
    }
  }
  if (!grantTypes.includes('authorization_code')) {
    return oauthError(400, 'invalid_client_metadata', 'grant_types must include authorization_code');
  }

  const requestedScope = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
  const scopes = Array.from(
    new Set([KNOWN_SCOPES[0], ...requestedScope.filter((s) => (KNOWN_SCOPES as readonly string[]).includes(s))]),
  );

  const logoUri = nonEmptyString(body.logo_uri);
  if (logoUri !== undefined && !/^https:\/\//i.test(logoUri)) {
    return oauthError(400, 'invalid_client_metadata', 'logo_uri must be an https URL');
  }

  const clientId = `dcr_${randomUUID()}`;
  const issuedAt = new Date();

  try {
    await db.insert(schema.mcpClients).values({
      clientId,
      name: clientName,
      scopes,
      isActive: true,
      redirectUris,
      grantTypes,
      tokenEndpointAuthMethod: tokenAuthMethod,
      logoUri: logoUri ?? null,
      createdVia: 'dcr',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return oauthError(500, 'server_error', `Failed to register client: ${msg}`);
  }

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      token_endpoint_auth_method: tokenAuthMethod,
      scope: scopes.join(' '),
      client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
      ...(logoUri ? { logo_uri: logoUri } : {}),
    },
    { status: 201, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function oauthError(status: number, error: string, description: string): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
}