import { NextResponse } from 'next/server';
import { getSiteUrl } from '../site-url';
import {
  REQUIRED_READ_SCOPE,
  REQUIRED_WRITE_SCOPE,
  REQUIRED_ADMIN_SCOPE,
} from '@pm-operator/mcp';

/**
 * Shared constants + helpers for the OAuth 2.1 Authorization Server mounted
 * under /oauth and /api/oauth. The AS exists solely to issue the HS256 JWTs
 * the MCP resource server (/api/mcp) already verifies, so it reuses MCP_ENABLED
 * as its single gate and the scope constants the verifier advertises.
 */

export const KNOWN_SCOPES = [
  REQUIRED_READ_SCOPE,
  REQUIRED_WRITE_SCOPE,
  REQUIRED_ADMIN_SCOPE,
] as const;

// Authorization-code lifetime (short, single-use), access-token lifetime (1h),
// and refresh-token lifetime (30d, rotatable). All in seconds.
export const CODE_TTL_S = 120;
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 30;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

export interface OAuthEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
}

// Returns null when NEXT_PUBLIC_SITE_URL is unset on the server (misconfig) so
// routes can answer 500 the same way the protected-resource metadata route does.
export function oauthEndpoints(): OAuthEndpoints | null {
  const base = getSiteUrl();
  if (!base) return null;
  return {
    issuer: base,
    authorizationEndpoint: `${base}/oauth/authorize`,
    tokenEndpoint: `${base}/api/oauth/token`,
    registrationEndpoint: `${base}/api/oauth/register`,
    revocationEndpoint: `${base}/api/oauth/revoke`,
  };
}

// The AS is gated by MCP_ENABLED (the same flag as the /api/mcp resource). When
// disabled, endpoints 404 so clients don't discover a live AS that can't issue.
export function requireMcpEnabled(): NextResponse | null {
  if (process.env.MCP_ENABLED !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }
  return null;
}

export function serverMisconfigured(message: string): NextResponse {
  return new NextResponse(message, { status: 500 });
}