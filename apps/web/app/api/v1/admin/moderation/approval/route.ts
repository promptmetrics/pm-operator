export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import { eq, desc, and, or, inArray } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  getDb,
  ok,
  requireSession,
  parseBody,
  parseQuery,
  paginationMeta,
  forbidden,
  notFound,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminCreateAuditLog,
} from '@/lib/services/admin';

const approvalQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  status: z.enum(['draft', 'flagged']).optional(),
  circleId: z.string().uuid().optional(),
});

const approvalActionSchema = z.object({
  postId: z.string().uuid(),
  action: z.enum(['approve', 'decline']),
  feedback: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, approvalQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    const conditions: any[] = [
      or(eq(schema.posts.status, 'draft'), eq(schema.posts.status, 'flagged')),
    ];
    if (query.status) {
      conditions.push(eq(schema.posts.status, query.status));
    }
    if (query.circleId) {
      conditions.push(eq(schema.posts.groupId, query.circleId));
    }

    const where = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const rows = await getDb().query.posts.findMany({
      where,
      orderBy: [desc(schema.posts.createdAt)],
      limit: query.limit + 1,
      offset,
    });

    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;

    // Resolve author and group names
    const authorIds = Array.from(new Set(slice.map((r) => r.authorId)));
    const groupIds = Array.from(new Set(slice.map((r) => r.groupId)));

    const [authors, groups] = await Promise.all([
      getDb().query.users.findMany({
        where: inArray(schema.users.id, authorIds),
        columns: { id: true, username: true, userslug: true },
      }),
      getDb().query.groups.findMany({
        where: inArray(schema.groups.id, groupIds),
        columns: { id: true, slug: true, name: true },
      }),
    ]);

    const authorMap = new Map(authors.map((a) => [a.id, a]));
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const posts = slice.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      contentPlain: p.contentPlain,
      type: p.type,
      status: p.status,
      author: authorMap.get(p.authorId) ?? { id: p.authorId, username: 'unknown', userslug: 'unknown' },
      group: groupMap.get(p.groupId) ?? { id: p.groupId, slug: 'unknown', name: 'Unknown' },
      slug: p.slug,
      createdAt: p.createdAt.toISOString(),
    }));

    return ok({ posts }, paginationMeta(query.page, query.limit, hasMore));
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = await parseBody(request, approvalActionSchema);
  if (body instanceof Response) return body;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    const post = await getDb().query.posts.findFirst({
      where: eq(schema.posts.id, body.postId),
    });
    if (!post) return notFound('Post not found');

    if (body.action === 'approve') {
      await getDb()
        .update(schema.posts)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(schema.posts.id, body.postId));
    } else {
      await getDb()
        .update(schema.posts)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(schema.posts.id, body.postId));
    }

    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: body.action === 'approve' ? 'post_approved' : 'post_declined',
      targetType: 'post',
      targetId: body.postId,
      circleId: post.groupId,
      details: { feedback: body.feedback ?? null, postTitle: post.title },
    });

    return ok({ success: true });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}
