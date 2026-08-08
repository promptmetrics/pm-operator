import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, signIn, dismissOverlays } from './helpers';

const usersToClean: string[] = [];

// These tests share the same test DB and need to run one at a time.
test.describe.configure({ mode: 'serial' });

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('logged-in community journey', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);

  // 1. Header reflects the authenticated user.
  await page.goto('/feed');
  await dismissOverlays(page);
  await expect(page.getByText(user.username)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();

  // 2. Join the public circle first — membership gates likes, comments, and posts.
  await page.goto('/g/show-your-build');
  await dismissOverlays(page);
  await page.getByRole('button', { name: 'Join circle' }).click();
  await expect(page.getByRole('button', { name: 'Leave circle' })).toBeVisible();

  // 3. Open a seeded post in the circle and verify detail loads.
  const seededPostUrl = '/g/show-your-build/open-source-mcp-router-we-shipped-last-week-20000000';
  await page.goto(seededPostUrl);
  await dismissOverlays(page);
  // Heading role, not getByText: the async community layout makes Next.js
  // stream the <title> tag into the body, which getByText also matches.
  await expect(
    page.getByRole('heading', { name: 'Open-source MCP router we shipped last week' })
  ).toBeVisible();

  // 4. Like the post.
  const likeButton = page.getByRole('button', { name: /upvotes/i });
  await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
  await dismissOverlays(page);
  await likeButton.click();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');

  // 5. Add a comment.
  await dismissOverlays(page);
  await page.getByRole('button', { name: /Add a comment/i }).click();
  const commentBody = `End-to-end comment ${Date.now()}`;
  await page.locator('.ProseMirror').fill(commentBody);
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText(commentBody)).toBeVisible();

  // 6. Create a new thread in the circle.
  await page.goto('/g/show-your-build');
  await dismissOverlays(page);
  await page.getByRole('button', { name: /Ask a question or show your build/i }).click();
  await expect(page).toHaveURL(/\/post\/new/);
  const postTitle = `E2E journey post ${Date.now()}`;
  await page.getByLabel('Title').fill(postTitle);
  // The composer defaults to the current circle; make sure it stayed selected.
  await page.locator('#circle-select').selectOption('show-your-build');
  await page.locator('.ProseMirror').fill('<p>End-to-end journey content</p>');
  // exact: true — the header search pill ("Search posts, circles, people…")
  // also substring-matches "Post".
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // After posting, the user lands on the new post detail or the circle feed.
  await expect(page).toHaveURL(/\/g\/show-your-build\/e2e-journey-post/);
  await page.goto('/g/show-your-build');
  await dismissOverlays(page);
  await expect(page.getByText(postTitle).first()).toBeVisible();
});
