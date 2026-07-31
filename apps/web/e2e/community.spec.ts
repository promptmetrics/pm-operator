import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, signIn, slugify, dismissOverlays } from './helpers';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('community post lifecycle', async ({ page }) => {
  const user = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);

  // Create a public group via API.
  const groupSlug = slugify('community-test');
  const groupName = `Community test ${Date.now()}`;
  const groupRes = await page.request.post('/api/v1/groups', {
    data: {
      slug: groupSlug,
      name: groupName,
      visibility: 'public',
      color: '#000000',
    },
  });
  expect(groupRes.status()).toBe(200);
  const groupBody = await groupRes.json();
  expect(groupBody.data.id).toBeTruthy();
  expect(groupBody.data.slug).toBe(groupSlug);

  // Create a post in the group via API.
  const postTitle = `Test post ${Date.now()}`;
  const postRes = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug,
      title: postTitle,
      content: '<p>Test post content</p>',
      type: 'discussion',
      tags: [],
    },
  });
  expect(postRes.status()).toBe(200);
  const postBody = await postRes.json();
  const postId = postBody.data.id;
  expect(postBody.data.title).toBe(postTitle);

  // Verify the post renders in the group feed (UI + API).
  await page.goto(`/g/${groupSlug}`);
  await dismissOverlays(page);
  const postTitleLocator = page.locator(`#post-title-${postId}`);
  await expect(postTitleLocator).toContainText(postTitle);

  const feedRes = await page.request.get(`/api/v1/feed?groupSlug=${groupSlug}`);
  expect(feedRes.status()).toBe(200);
  const feedBody = await feedRes.json();
  expect(feedBody.data.posts.map((p: { id: string }) => p.id)).toContain(postId);

  // Add a comment via API.
  const commentRes = await page.request.post(`/api/v1/posts/${postId}/comments`, {
    data: { content: 'End-to-end test comment' },
  });
  expect(commentRes.status()).toBe(200);
  const commentBody = await commentRes.json();
  expect(commentBody.data.content).toContain('End-to-end test comment');

  // Toggle a reaction on the post via API.
  const reactionRes = await page.request.post('/api/v1/reactions', {
    data: { targetType: 'post', targetId: postId, reactionType: 'like' },
  });
  expect(reactionRes.status()).toBe(200);

  // Edit the post via API.
  const editedTitle = `Edited post ${Date.now()}`;
  const patchRes = await page.request.patch(`/api/v1/posts/${postId}`, {
    data: { title: editedTitle, content: '<p>Edited post content</p>' },
  });
  expect(patchRes.status()).toBe(200);
  const patchBody = await patchRes.json();
  expect(patchBody.data.title).toBe(editedTitle);
  expect(patchBody.data.content).toContain('Edited post content');

  // Soft-delete / hide the post via API.
  const hideRes = await page.request.patch(`/api/v1/posts/${postId}`, {
    data: { status: 'hidden' },
  });
  expect(hideRes.status()).toBe(200);
  const hideBody = await hideRes.json();
  expect(hideBody.data.status).toBe('hidden');
});
