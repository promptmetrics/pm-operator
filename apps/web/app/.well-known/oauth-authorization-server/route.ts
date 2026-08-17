import { NextResponse } from 'next/server';
import {
  KNOWN_SCOPES,
  CORS_HEADERS,
  oauthEndpoints,
  requireMcpEnabled,
  serverMisconfigured,
} from '@/lib/oauth/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RFC 8414 Authorization Server Metadata for the operator community MCP.
//
// A 2026-07-28 client discovers the AS by following `authorization_servers`
// from the RFC 9728 protected-resource metadata
// (/.well-known/oauth-protected-resource/api/mcp) to this document, which points
// it at the authorize/token/register/revoke endpoints and the scopes/PKCE
// methods it supports.
//
// NOTE: the RFC 8414 `issuer` is a URL (the bare origin, e.g.
// https://operator.promptmetrics.dev). It is distinct from the JWT `iss` claim
// the verifier requires (the bare host `operator.promptmetrics.dev`) — do not
// conflate them.
export async function GET() {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  const endpoints = oauthEndpoints();
  if (!endpoints) {
    return serverMisconfigured('Server misconfigured: NEXT_PUBLIC_SITE_URL not set');
  }

  const body = {
    issuer: endpoints.issuer,
    authorization_endpoint: endpoints.authorizationEndpoint,
    token_endpoint: endpoints.tokenEndpoint,
    registration_endpoint: endpoints.registrationEndpoint,
    revocation_endpoint: endpoints.revocationEndpoint,
    scopes_supported: [...KNOWN_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  };

  return NextResponse.json(body, {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}