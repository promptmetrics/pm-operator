import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteFlag,
  signIn,
  slugify,
  dismissOverlays,
} from './helpers';

const usersToClean: string[] = [];
const flagsToClean: string[] = [];

test.afterEach(async () => {
  // Delete flags before users: flags.reporterId is `onDelete: 'set null'`, so
  // removing the user first would leave an orphan open flag in the queue.
  for (const flagId of flagsToClean) {
    await deleteFlag(flagId).catch(() => {});
  }
  flagsToClean.length = 0;
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('moderation queue links a comment flag to the post with the comment anchor', async ({
  page,
}) => {
  const moderator = await createTestUser({ role: 'moderator', onboardingComplete: true });
  usersToClean.push(moderator.id);

  await signIn(page, moderator.email, moderator.password);

  // Create a public group via API.
  const groupSlug = slugify('mod-anchor');
  const groupRes = await page.request.post('/api/v1/groups', {
    data: {
      slug: groupSlug,
      name: `Mod anchor ${Date.now()}`,
      visibility: 'public',
      color: '#000000',
    },
  });
  expect(groupRes.status()).toBe(200);
  const groupBody = await groupRes.json();
  expect(groupBody.data.slug).toBe(groupSlug);

  // Create a post with a comment via API.
  const postRes = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug,
      title: `Mod anchor post ${Date.now()}`,
      content: '<p>Mod anchor test content</p>',
      type: 'discussion',
      tags: [],
    },
  });
  expect(postRes.status()).toBe(200);
  const postBody = await postRes.json();
  const postId = postBody.data.id;
  const postSlug = postBody.data.slug;

  const commentRes = await page.request.post(`/api/v1/posts/${postId}/comments`, {
    data: { content: 'Comment that will be flagged' },
  });
  expect(commentRes.status()).toBe(200);
  const commentBody = await commentRes.json();
  const commentId = commentBody.data.id;

  // Flag the comment via API with a unique reason so the queue card is findable.
  const flagReason = `e2e anchor test ${Date.now()}`;
  const flagRes = await page.request.post('/api/v1/flags', {
    data: { targetType: 'comment', targetId: commentId, reason: flagReason },
  });
  expect(flagRes.status()).toBe(200);
  const flagBody = await flagRes.json();
  flagsToClean.push(flagBody.data.id);

  // Open the moderation queue and follow this flag's View link (opens a new tab).
  await page.goto('/moderation');
  await dismissOverlays(page);
  const flagCard = page.locator('div.space-y-2', { hasText: flagReason });
  const viewButton = flagCard.getByRole('button', { name: 'View' });
  await expect(viewButton).toBeVisible();

  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    viewButton.click(),
  ]);
  await popup.waitForLoadState('load');

  // The popup must land on the parent post page with the comment anchor in the URL…
  expect(popup.url()).toContain(`/g/${groupSlug}/${postSlug}#comment-${commentId}`);

  // …and the anchored comment must end up inside the viewport — comments load
  // asynchronously, so wait for the hash-scroll effect rather than relying on
  // toBeVisible()'s auto-scroll, which would mask a broken anchor.
  await popup.waitForFunction(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    },
    `comment-${commentId}`,
    { timeout: 15_000 }
  );
  const box = await popup.locator(`#comment-${commentId}`).boundingBox();
  const viewport = popup.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  await popup.close();
});
