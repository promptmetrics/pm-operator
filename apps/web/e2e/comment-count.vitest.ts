// The comment count rendered next to a thread must equal the thread. A live post
// shipped "1 comments" as its heading directly above "No comments yet", because
// the page rendered the denormalized posts.comment_count column while the list
// came from commentVisibilityFilter — two different predicates.
//
// These tests pin the three things that keep them in agreement:
//   1. commentTotalForViewer counts through the same filter as the list.
//   2. hiding or deleting a parent cascades to its replies, so no published
//      reply is left counted-but-unreachable under an invisible parent.
//   3. the trg_comment_count trigger (migration 0001) is actually installed —
//      without it every assertion here passes for the wrong reason.
//
// Comments are inserted directly rather than through createComment(): the
// trigger fires either way, and the service path drags in points, notifications
// and email that this test has no opinion about. Hide/delete DO go through the
// service, because that cascade is the behavior under test.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect } from 'vitest';

import { eq, and, isNull, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  commentTotalForViewer,
  listCommentsForPost,
  updateComment,
  deleteComment,
} from '../lib/services/comments';
import {
  serviceDb,
  createTestUser,
  createPublicGroup,
  createPublishedPost,
  deleteTestUser,
  deleteGroup,
} from './helpers';

const db = serviceDb();

// Same budget the other DB-backed suites use (groups-list-stats, concurrency).
// These tests do 6-10 sequential round trips to a remote pooler, which overruns
// vitest's 5s default whenever the suite runs in parallel.
const DB_TIMEOUT = 60_000;

async function storedCount(postId: string): Promise<number> {
  const row = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
    columns: { commentCount: true },
  });
  return row?.commentCount ?? -1;
}

async function insertComment(
  postId: string,
  authorId: string,
  body: string,
  parentCommentId?: string
): Promise<string> {
  const [row] = await db
    .insert(schema.comments)
    .values({
      postId,
      authorId,
      parentCommentId: parentCommentId ?? null,
      content: `<p>${body}</p>`,
      contentPlain: body,
    })
    .returning();
  if (!row) throw new Error('Failed to insert comment');
  return row.id;
}

test('trg_comment_count is installed on public.comments', async () => {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS present
    FROM pg_trigger
    WHERE tgname = 'trg_comment_count'
      AND tgrelid = 'public.comments'::regclass
      AND NOT tgisinternal
  `);
  const present = Number((rows as unknown as Array<{ present: number }>)[0]?.present ?? 0);
  expect(
    present,
    'without this trigger posts.comment_count silently stops tracking comments; reinstall with packages/db/apply-missing-fixes.mjs'
  ).toBeGreaterThan(0);
});

test('a comment is counted, and deleting it is uncounted', async () => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  let groupId: string | undefined;
  try {
    const group = await createPublicGroup(admin.id);
    groupId = group.id;
    const postId = await createPublishedPost(group.id, admin.id, 'Count me');

    expect(await commentTotalForViewer(db, postId, undefined)).toBe(0);

    const commentId = await insertComment(postId, admin.id, 'First');
    expect(await commentTotalForViewer(db, postId, undefined)).toBe(1);
    expect(await storedCount(postId)).toBe(1);

    const page = await listCommentsForPost(db, postId, undefined, {
      sort: 'new',
      limit: 20,
      offset: 0,
    });
    expect(page.total).toBe(1);
    expect(page.comments).toHaveLength(1);

    await deleteComment(db, commentId, admin.id);
    expect(await commentTotalForViewer(db, postId, undefined)).toBe(0);
    expect(await storedCount(postId)).toBe(0);

    const after = await listCommentsForPost(db, postId, undefined, {
      sort: 'new',
      limit: 20,
      offset: 0,
    });
    expect(after.total).toBe(0);
    expect(after.comments).toHaveLength(0);
  } finally {
    if (groupId) await deleteGroup(groupId);
    await deleteTestUser(admin.id);
  }
}, DB_TIMEOUT);

test('hiding a parent comment takes its replies out of both the list and the count', async () => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  let groupId: string | undefined;
  try {
    const group = await createPublicGroup(admin.id);
    groupId = group.id;
    const postId = await createPublishedPost(group.id, admin.id, 'Cascade me');

    const parentId = await insertComment(postId, admin.id, 'Parent');
    await insertComment(postId, admin.id, 'Reply', parentId);
    expect(await commentTotalForViewer(db, postId, undefined)).toBe(2);
    expect(await storedCount(postId)).toBe(2);

    await updateComment(db, parentId, { status: 'hidden' }, admin.id);

    // Without the cascade the reply stays `published`: still counted by the
    // trigger, but unreachable because the reply fetch only looks under root
    // comments the viewer can see.
    const orphans = await db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.parentCommentId, parentId),
          eq(schema.comments.status, 'published')
        )
      );
    expect(orphans).toHaveLength(0);

    expect(await commentTotalForViewer(db, postId, undefined)).toBe(0);
    expect(await storedCount(postId)).toBe(0);

    const page = await listCommentsForPost(db, postId, undefined, {
      sort: 'new',
      limit: 20,
      offset: 0,
    });
    expect(page.total).toBe(0);
    expect(page.comments).toHaveLength(0);

    // The rows are still there — hidden, not deleted.
    const remaining = await db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.postId, postId));
    expect(remaining).toHaveLength(2);
  } finally {
    if (groupId) await deleteGroup(groupId);
    await deleteTestUser(admin.id);
  }
}, DB_TIMEOUT);

test('the count a member sees matches the tombstones the member is shown', async () => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  let groupId: string | undefined;
  try {
    const group = await createPublicGroup(admin.id);
    groupId = group.id;
    const postId = await createPublishedPost(group.id, admin.id, 'Tombstone me');

    const visibleId = await insertComment(postId, admin.id, 'Visible');
    const hiddenId = await insertComment(postId, admin.id, 'To be hidden');
    await updateComment(db, hiddenId, { status: 'hidden' }, admin.id);

    // Anonymous: the hidden row is neither listed nor counted.
    const anonPage = await listCommentsForPost(db, postId, undefined, {
      sort: 'new',
      limit: 20,
      offset: 0,
    });
    expect(anonPage.total).toBe(1);
    expect(anonPage.comments).toHaveLength(1);
    expect(anonPage.comments[0]?.id).toBe(visibleId);

    // The admin sees the tombstone, so the admin's total must include it —
    // this is the mismatch that posts.comment_count (published-only) cannot
    // represent, and the reason the UI renders `total` instead.
    const adminPage = await listCommentsForPost(db, postId, admin.id, {
      sort: 'new',
      limit: 20,
      offset: 0,
    });
    const adminShown = adminPage.comments.reduce(
      (n, c) => n + 1 + (c.replies?.length ?? 0),
      0
    );
    expect(adminPage.total).toBe(2);
    expect(adminShown).toBe(2);
    expect(await storedCount(postId)).toBe(1);

    // Sanity: root-only paging is unaffected.
    const roots = await db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(and(eq(schema.comments.postId, postId), isNull(schema.comments.parentCommentId)));
    expect(roots).toHaveLength(2);
  } finally {
    if (groupId) await deleteGroup(groupId);
    await deleteTestUser(admin.id);
  }
}, DB_TIMEOUT);
