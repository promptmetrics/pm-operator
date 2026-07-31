import { NextResponse, type NextRequest } from 'next/server';
import {
  createCommunityMcpServer,
  createMcpHandler,
  verifyMcpOAuthToken,
} from '@pm-operator/mcp';
import { createServiceDb } from '@/lib/db';
import { createMcpServices } from '@/lib/services/mcp';
import { checkRateLimit } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

const db = createServiceDb();
const services = createMcpServices(db, logger);

const handler = createMcpHandler({
  server: createCommunityMcpServer({ services, logger }),
  supportedProtocolVersions: ['2026-07-28', '2025-03-26', '2024-11-05'],
  auth: { verify: verifyMcpOAuthToken },
});

async function requireMcpAuthAndRateLimit(req: NextRequest) {
  if (process.env.MCP_ENABLED !== 'true') {
    return new NextResponse('MCP not enabled', { status: 503 });
  }

  const auth = await verifyMcpOAuthToken(req);
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
