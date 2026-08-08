import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  dismissOverlays,
  createInviteOnlyGroup,
  createPublishedPost,
} from './helpers';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('left rail renders on community pages, collapses, and persists', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);
  await page.goto('/feed');
  await dismissOverlays(page);

  // Rail is part of the community layout, not the feed page.
  const rail = page.getByTestId('left-rail');
  await expect(rail).toBeVisible();

  // Navigation through the rail.
  await rail.getByRole('link', { name: 'Leaderboards' }).click();
  await page.waitForURL('/leaderboards');
  await expect(rail).toBeVisible();

  // Collapse via the header hamburger.
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(rail).toBeHidden();

  // Collapsed state persists across a full navigation (localStorage).
  await page.goto('/feed');
  await dismissOverlays(page);
  await expect(rail).toBeHidden();

  // Expand again.
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(rail).toBeVisible();
});

test('bookmarks page renders a bookmarked post', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  const group = await createInviteOnlyGroup(user.id);
  const postTitle = `Bookmarked post ${Date.now()}`;
  const postId = await createPublishedPost(group.id, user.id, postTitle);

  await signIn(page, user.email, user.password);

  // Bookmark the post via the existing toggle endpoint.
  const bookmarkRes = await page.request.post('/api/v1/bookmarks', {
    data: { postId },
  });
  expect(bookmarkRes.status()).toBe(200);
  const bookmarkBody = await bookmarkRes.json();
  expect(bookmarkBody.data.bookmarked).toBe(true);

  // Reach the page through the rail link, then verify the post renders.
  await page.goto('/feed');
  await dismissOverlays(page);
  await page.getByTestId('left-rail').getByRole('link', { name: 'Bookmarks' }).click();
  await page.waitForURL('/bookmarks');

  await expect(page.locator(`#post-title-${postId}`)).toContainText(postTitle);
});
