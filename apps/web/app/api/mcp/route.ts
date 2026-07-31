import { NextResponse, type NextRequest } from 'next/server';
import {
  createCommunityMcpServer,
  createMcpHandler,
  verifyMcpOAuthToken,
  type McpClientInfo,
} from '@pm-operator/mcp';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { createMcpServices } from '@/lib/services/mcp';
import { checkRateLimit } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

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

const handler = createMcpHandler({
  createServer: () => createCommunityMcpServer({ services, logger }),
  auth: { verify: (req) => verifyMcpOAuthToken(req, { lookupClient }) },
});

async function requireMcpAuthAndRateLimit(req: NextRequest) {
  if (process.env.MCP_ENABLED !== 'true') {
    return new NextResponse('MCP not enabled', { status: 503 });
  }

  const auth = await verifyMcpOAuthToken(req, { lookupClient });
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
          'Retry-After': String(rate.reset - Math.floor(Date.now() / 1000)),
        },
      }
    );
  }

  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireMcpAuthAndRateLimit(req);
  if (gate) return gate;
  return handler(req);
}

export async function POST(req: NextRequest) {
  const gate = await requireMcpAuthAndRateLimit(req);
  if (gate) return gate;
  return handler(req);
}
