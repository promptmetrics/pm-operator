import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
} as const;

// RFC 9728 Protected Resource Metadata for the operator community MCP server.
//
// Served at the path getOAuthProtectedResourceMetadataUrl() derives from the
// resource URL (https://…/api/mcp → /.well-known/oauth-protected-resource/api/mcp),
// so a 2026-07-28 client that received a `WWW-Authenticate: Bearer
// resource_metadata="…"` challenge can discover the resource here.
//
// `authorization_servers` is empty: we still issue hand-rolled HS256 JWTs and
// have no Authorization Server / DCR endpoint. Standing one up is a follow-up.
export async function GET() {
  if (process.env.MCP_ENABLED !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return new NextResponse('Server misconfigured: NEXT_PUBLIC_SITE_URL not set', { status: 500 });
  }

  const resource = `${siteUrl.replace(/\/$/, '')}/api/mcp`;
  const body = {
    resource,
    authorization_servers: [],
    bearer_methods_supported: ['POST'],
    scopes_supported: ['community:read'],
  };

  return NextResponse.json(body, { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}