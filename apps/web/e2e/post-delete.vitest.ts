// Deleting a post must not throw after the write commits. updatePost reloads
// the post through getPostById to build its return value, and a status of
// 'deleted' is invisible to EVERYONE via postVisibilityFilter — including the
// actor who just did the deleting. Before the includeDeleted reload opt, every
// escalation to 'deleted' persisted correctly and then threw
// "Failed to load updated post", so MCP/API callers saw a phantom failure.
//
// What these tests pin:
//   1. deletePost (the soft path) returns a detail with status 'hidden'.
//   2. updatePost to 'deleted' RETURNS (the regression) with status 'deleted'.
//   3. the widened reload did not leak: a plain getPostById still refuses to
//      show a deleted post, even to its author.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { test, expect, afterAll } from 'vitest';

import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { updatePost, deletePost, getPostById } from '../lib/services/posts';
import {
  serviceDb,
  createTestUser,
  createPublicGroup,
  createPublishedPost,
  deleteTestUser,
  deleteGroup,
} from './helpers';

const db = serviceDb();
const DB_TIMEOUT = 60_000;

const cleanup: { postIds: string[]; groupIds: string[]; userIds: string[] } = {
  postIds: [],
  groupIds: [],
  userIds: [],
};

afterAll(async () => {
  for (const id of cleanup.postIds) {
    await db.delete(schema.posts).where(eq(schema.posts.id, id));
  }
  for (const id of cleanup.groupIds) {
    await deleteGroup(id);
  }
  for (const id of cleanup.userIds) {
    await deleteTestUser(id);
  }
});

test(
  'deletePost soft-hides and returns the detail',
  async () => {
    const author = await createTestUser({ role: 'admin' });
    cleanup.userIds.push(author.id);
    const group = await createPublicGroup(author.id);
    cleanup.groupIds.push(group.id);
    const postId = await createPublishedPost(group.id, author.id);
    cleanup.postIds.push(postId);

    const detail = await deletePost(db, postId, author.id);
    expect(detail.id).toBe(postId);
    expect(detail.status).toBe('hidden');
  },
  DB_TIMEOUT
);

test(
  'escalating to deleted returns instead of throwing after the write',
  async () => {
    const author = await createTestUser({ role: 'admin' });
    cleanup.userIds.push(author.id);
    const group = await createPublicGroup(author.id);
    cleanup.groupIds.push(group.id);
    const postId = await createPublishedPost(group.id, author.id);
    cleanup.postIds.push(postId);

    // The regression: this resolved the UPDATE, then threw on the reload.
    const detail = await updatePost(db, postId, { status: 'deleted' }, author.id);
    expect(detail.id).toBe(postId);
    expect(detail.status).toBe('deleted');

    // The reload widening must not leak into normal reads: deleted stays
    // invisible through the standard path, even to the author who deleted it.
    expect(await getPostById(db, postId, author.id)).toBeNull();
  },
  DB_TIMEOUT
);
