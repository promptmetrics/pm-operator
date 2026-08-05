export const runtime = 'nodejs';

import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { leaderboardPeriodSchema, z } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  parseQuery,
  forbidden,
  notFound,
  paginationMeta,
} from '@/lib/api/server';
import { requireGlobalAdmin } from '@/lib/services/admin';
import { toNumber } from '@/lib/services/shared';

const listQuerySchema = z.object({
  period: leaderboardPeriodSchema.default('all_time'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const resetBodySchema = z.object({
  period: leaderboardPeriodSchema,
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
  } catch {
    return forbidden('Global admin access required');
  }

  const parsed = parseQuery(new URL(request.url).searchParams, listQuerySchema);
  if (parsed instanceof Response) return parsed;
  const query = parsed as z.infer<typeof listQuerySchema>;

  const page = query.page;
  const limit = query.limit;
  const offset = (page - 1) * limit;

  // Get top scores for the period
  const rows = await getDb()
    .select({
      userId: schema.userScores.userId,
      score: schema.userScores.score,
      username: schema.users.username,
      userslug: schema.users.userslug,
      role: schema.users.role,
      reputationScore: schema.users.reputationScore,
      streakDays: schema.users.streakDays,
    })
    .from(schema.userScores)
    .innerJoin(schema.users, eq(schema.userScores.userId, schema.users.id))
    .where(
      and(
        sql`${schema.userScores.period} = ${query.period}`,
        eq(schema.userScores.groupId, schema.GLOBAL_GROUP_ID)
      )
    )
    .orderBy(desc(schema.userScores.score))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const leaderboard = slice.map((row, i) => ({
    rank: offset + i + 1,
    userslug: row.userslug,
    username: row.username,
    score: toNumber(row.score),
    role: row.role,
    streakDays: row.streakDays,
  }));

  // Count total entries for the period
  const [countResult] = await getDb()
    .select({ total: sql<number>`count(*)` })
    .from(schema.userScores)
    .where(
      and(
        sql`${schema.userScores.period} = ${query.period}`,
        eq(schema.userScores.groupId, schema.GLOBAL_GROUP_ID)
      )
    );

  const total = Number(countResult?.total ?? 0);
  const totalPages = Math.ceil(total / limit);

  return ok({ leaderboard, period: query.period }, paginationMeta(page, limit, hasMore));
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
  } catch {
    return forbidden('Global admin access required');
  }

  const body = await parseBody(request, resetBodySchema);
  if (body instanceof Response) return body;
  const { period } = body as z.infer<typeof resetBodySchema>;

  // Reset scores for the given period by setting them to 0
  await getDb()
    .update(schema.userScores)
    .set({ score: '0', updatedAt: new Date() })
    .where(eq(schema.userScores.period, period));

  return ok({ reset: true, period });
}
