import { test, expect, type Page } from '@playwright/test';
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
  // removing the user first would leave an orphan flag in the queue.
  for (const flagId of flagsToClean) {
    await deleteFlag(flagId).catch(() => {});
  }
  flagsToClean.length = 0;
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

async function signInAsModerator(page: Page) {
  const moderator = await createTestUser({ role: 'moderator', onboardingComplete: true });
  usersToClean.push(moderator.id);
  await signIn(page, moderator.email, moderator.password);
  return moderator;
}

async function createGroup(page: Page, prefix: string) {
  const slug = slugify(prefix);
  const res = await page.request.post('/api/v1/groups', {
    data: {
      slug,
      name: `Restyle ${prefix} ${Date.now()}`,
      visibility: 'public',
      color: '#000000',
    },
  });
  expect(res.status()).toBe(200);
  return slug;
}

async function createPost(page: Page, groupSlug: string, content: string) {
  const res = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug,
      title: `Restyle post ${Date.now()}`,
      content,
      type: 'discussion',
      tags: [],
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { id: body.data.id as string, slug: body.data.slug as string };
}

async function createComment(page: Page, postId: string, content: string) {
  const res = await page.request.post(`/api/v1/posts/${postId}/comments`, {
    data: { content },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.id as string;
}

async function createFlag(
  page: Page,
  targetType: 'post' | 'comment',
  targetId: string,
  reason: string
) {
  const res = await page.request.post('/api/v1/flags', {
    data: { targetType, targetId, reason },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  flagsToClean.push(body.data.id);
  return body.data.id as string;
}

test('a free-text flag shows kind and reason pills, a quoted excerpt, and the reporter note', async ({
  page,
}) => {
  await signInAsModerator(page);

  const groupSlug = await createGroup(page, 'restyle-pills');
  const marker = `excerpt marker ${Date.now()}`;
  const post = await createPost(
    page,
    groupSlug,
    `<p><strong>${marker}</strong> plus some trailing prose.</p>`
  );

  const note = `reporter detail ${Date.now()}`;
  await createFlag(page, 'post', post.id, note);

  await page.goto('/moderation');
  await dismissOverlays(page);

  const card = page.getByTestId('flag-card').filter({ hasText: note });
  await expect(card).toHaveCount(1);

  await expect(card.getByTestId('flag-kind')).toContainText('Post');

  // Free text is not one of FlagDialog's canonical reasons, so it presents as
  // the "Other" category with the reporter's own words carried in the note.
  await expect(card.getByTestId('flag-reason')).toContainText('Other');
  await expect(card.getByTestId('flag-note')).toContainText('Reporter note');
  await expect(card.getByTestId('flag-note')).toContainText(note);

  // The excerpt quotes the content as text, with the stored markup stripped.
  const excerpt = card.getByRole('blockquote');
  await expect(excerpt).toContainText(marker);
  await expect(excerpt).not.toContainText('<strong>');
});

test('a canonical flag reason renders as a labelled pill with no reporter note', async ({
  page,
}) => {
  await signInAsModerator(page);

  const groupSlug = await createGroup(page, 'restyle-canonical');
  const post = await createPost(page, groupSlug, '<p>Parent post for a flagged comment.</p>');
  const commentText = `canonical reason comment ${Date.now()}`;
  const commentId = await createComment(page, post.id, commentText);

  await createFlag(page, 'comment', commentId, 'spam');

  await page.goto('/moderation');
  await dismissOverlays(page);

  const card = page.getByTestId('flag-card').filter({ hasText: commentText });
  await expect(card).toHaveCount(1);

  await expect(card.getByTestId('flag-kind')).toContainText('Comment');
  await expect(card.getByTestId('flag-reason')).toContainText('Spam');

  // A canonical reason adds nothing beyond the pill, so no note block is shown.
  await expect(card.getByTestId('flag-note')).toHaveCount(0);
});

test('a long flagged body is truncated in the quoted excerpt', async ({ page }) => {
  await signInAsModerator(page);

  const groupSlug = await createGroup(page, 'restyle-truncate');
  const tailMarker = 'ZZTAILMARKER';
  const post = await createPost(
    page,
    groupSlug,
    `<p>${'lorem ipsum dolor sit amet '.repeat(20)}${tailMarker}</p>`
  );

  const reason = `truncation check ${Date.now()}`;
  await createFlag(page, 'post', post.id, reason);

  await page.goto('/moderation');
  await dismissOverlays(page);

  const card = page.getByTestId('flag-card').filter({ hasText: reason });
  await expect(card).toHaveCount(1);

  const excerpt = card.getByRole('blockquote');
  await expect(excerpt).toContainText('lorem ipsum');
  // The tail sits well past the 240-character excerpt budget.
  await expect(excerpt).not.toContainText(tailMarker);

  const text = (await excerpt.innerText()).trim();
  expect(text.length).toBeLessThan(400);
});

test('the target-type filter narrows the loaded queue', async ({ page }) => {
  await signInAsModerator(page);

  const groupSlug = await createGroup(page, 'restyle-filter');
  const stamp = Date.now();
  const post = await createPost(page, groupSlug, '<p>Post body for the filter check.</p>');
  const commentText = `filter comment ${stamp}`;
  const commentId = await createComment(page, post.id, commentText);

  const postReason = `filter post reason ${stamp}`;
  const commentReason = `filter comment reason ${stamp}`;
  await createFlag(page, 'post', post.id, postReason);
  await createFlag(page, 'comment', commentId, commentReason);

  await page.goto('/moderation');
  await dismissOverlays(page);

  const postRow = page.getByTestId('flag-row').filter({ hasText: postReason });
  const commentRow = page.getByTestId('flag-row').filter({ hasText: commentReason });
  await expect(postRow).toHaveCount(1);
  await expect(commentRow).toHaveCount(1);

  await page.getByLabel('Target type').selectOption('comment');
  await expect(commentRow).toHaveCount(1);
  await expect(postRow).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(postRow).toHaveCount(1);
});

test('dismissing a flag leaves a resolution receipt and moves it into History', async ({
  page,
}) => {
  await signInAsModerator(page);

  const groupSlug = await createGroup(page, 'restyle-receipt');
  const post = await createPost(page, groupSlug, '<p>Body for the receipt check.</p>');
  const reason = `receipt check ${Date.now()}`;
  await createFlag(page, 'post', post.id, reason);

  await page.goto('/moderation');
  await dismissOverlays(page);

  const queueView = page.getByRole('group', { name: 'Queue view' });
  const row = page.getByTestId('flag-row').filter({ hasText: reason });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Dismiss', exact: true }).click();

  // The card stays put and reports the outcome instead of vanishing.
  await expect(row).toHaveCount(1);
  const receipt = row.getByTestId('resolution-receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('Dismissed, no action');
  await expect(receipt).toContainText('by you');

  // History surfaces it under the matching outcome...
  await queueView.getByRole('button', { name: 'History' }).click();
  await page
    .getByRole('group', { name: 'Resolution outcome' })
    .getByRole('button', { name: 'Dismissed' })
    .click();
  await expect(page.getByTestId('flag-row').filter({ hasText: reason })).toHaveCount(1);

  // ...and a fresh load of Open no longer lists it. Reload rather than just
  // switching filters: the receipt deliberately keeps the resolved card on
  // screen until the queue is refetched, so clicking Open races that refetch.
  await page.goto('/moderation');
  await dismissOverlays(page);
  await expect(queueView.getByRole('button', { name: 'Open' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('flag-row').filter({ hasText: reason })).toHaveCount(0);
});
