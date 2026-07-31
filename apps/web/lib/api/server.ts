import 'server-only';

import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb, type DrizzleClient } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { checkRateLimit, type RateLimitTier } from '@/lib/rate-limit';
import { z, ErrorCode, type PaginationMeta } from '@pm-operator/api';

let dbInstance: DrizzleClient | undefined;
export function getDb(): DrizzleClient {
  if (!dbInstance) {
    dbInstance = createServiceDb();
  }
  return dbInstance;
}

const RATE_LIMIT_HEADERS = {
  'X-RateLimit-Window': '60',
} as const;

export function ok<T>(data: T, meta?: PaginationMeta, status = 200): Response {
  const body: Record<string, unknown> = { data };
  if (meta) body.meta = meta;
  return Response.json(body, { status });
}

export function error(
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
  status: number,
  field: string | null = null
): Response {
  return Response.json({ error: { code, message, field } }, { status });
}

export function notFound(message = 'Resource not found'): Response {
  return error(ErrorCode.NOT_FOUND, message, 404);
}

export function forbidden(message = 'Forbidden'): Response {
  return error(ErrorCode.FORBIDDEN, message, 403);
}

export async function requireSession(): Promise<{ userId: string } | Response> {
  const { session, error: sessionError } = await getSession();
  if (sessionError || !session?.user) {
    return error(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }
  return { userId: session.user.id };
}

export async function requireOnboarding(userId: string): Promise<Response | null> {
  const user = await getDb().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { painfulToolStackTask: true },
  });
  if (!user?.painfulToolStackTask) {
    return error(
      ErrorCode.ONBOARDING_INCOMPLETE,
      'Complete onboarding before performing this action',
      403
    );
  }
  return null;
}

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T, any, any>
): Promise<T | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(ErrorCode.VALIDATION_ERROR, 'Invalid JSON body', 400);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues;
    const message = issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');
    return error(
      ErrorCode.VALIDATION_ERROR,
      message,
      400,
      issues[0]?.path.join('.') || null
    );
  }
  return result.data;
}

export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T, any, any>
): T | Response {
  const input = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues;
    const message = issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');
    return error(
      ErrorCode.VALIDATION_ERROR,
      message,
      400,
      issues[0]?.path.join('.') || null
    );
  }
  return result.data;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  // NextRequest exposes the client IP when running on Vercel.
  return (req as unknown as { ip?: string }).ip ?? 'unknown';
}

export async function rateLimit(
  tier: RateLimitTier,
  identifier: string
): Promise<Response | null> {
  const result = await checkRateLimit(tier, identifier);
  if (!result.success) {
    return Response.json(
      {
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Please slow down.',
          field: null,
        },
      },
      {
        status: 429,
        headers: {
          ...RATE_LIMIT_HEADERS,
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.reset),
          'Retry-After': String(result.reset - Math.floor(Date.now() / 1000)),
        },
      }
    );
  }
  return null;
}

export function paginationMeta(
  page: number,
  limit: number,
  hasMore: boolean
): PaginationMeta {
  return { page, limit, hasMore };
}
