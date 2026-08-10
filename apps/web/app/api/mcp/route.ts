import { NextResponse, type NextRequest } from 'next/server';
import {
  createCommunityMcpServer,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  verifyMcpOAuthToken,
  type McpClientInfo,
  type VerifiedMcpToken,
} from '@pm-operator/mcp';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { createMcpServices } from '@/lib/services/mcp';
import { checkRateLimit } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
// createServiceDb() runs at module scope — never let this route prerender
// (ISR would attempt it at build time, when CI has no DATABASE_URL).
export const dynamic = 'force-dynamic';

const db = createServiceDb();
const services = createMcpServices(db, logger);

async function lookupClient(clientId: string): Promise<McpClientInfo | undefined> {
  const rows = await db
    .select({
      clientId: schema.mcpClients.clientId,
      scopes: schema.mcpClients.scopes,
      isActive: schema.mcpClients.isActive,
    })
    .from(schema.mcpClients)
    .where(eq(schema.mcpClients.clientId, clientId))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return {
    clientId: row.clientId,
    scopes: row.scopes,
    isActive: row.isActive,
  };
}

// v2's handler factory: one fresh, stateless McpServer per request. Auth is
// pass-through here — the route verifies the token once and hands the
// AuthInfo to fetch(); v2 performs no token verification of its own.
const handler = createMcpHandler(() => createCommunityMcpServer({ services, logger }));

function resourceMetadataUrl(): string | undefined {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return undefined;
  try {
    return getOAuthProtectedResourceMetadataUrl(new URL(`${siteUrl.replace(/\/$/, '')}/api/mcp`));
  } catch {
    return undefined;
  }
}

// Single auth + rate-limit pass. Returns the verified token, or a challenge
// Response (401/403/429, or 404 when the MCP server is disabled).
async function requireMcpAuthAndRateLimit(
  req: NextRequest
): Promise<VerifiedMcpToken | Response> {
  if (process.env.MCP_ENABLED !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const auth = await verifyMcpOAuthToken(req, {
    lookupClient,
    resourceMetadataUrl: resourceMetadataUrl(),
  });
  if (auth instanceof Response) {
    return auth;
  }

  const rate = await checkRateLimit('mcpRead', auth.clientId);
  if (!rate.success) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
          field: null,
        },
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(rate.reset),
          'Retry-After': String(Math.max(0, rate.reset - Math.floor(Date.now() / 1000))),
        },
      }
    );
  }

  return auth;
}

// 2026-07-28 removes the GET stream — only POST is served. Next.js returns
// 405 for the unexported methods (GET/DELETE/etc.) automatically.
export async function POST(req: NextRequest) {
  const gate = await requireMcpAuthAndRateLimit(req);
  if (gate instanceof Response) return gate;

  const auth = gate;
  return handler.fetch(req, {
    authInfo: {
      token: auth.token,
      clientId: auth.clientId,
      scopes: auth.scopes,
      expiresAt: auth.expiresAt,
      extra: auth.userId ? { userId: auth.userId } : undefined,
    },
  });
}