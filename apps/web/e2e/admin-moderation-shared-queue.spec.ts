import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteFlag,
  signIn,
  slugify,
  dismissOverlays,
} from './helpers';

// /admin/moderation used to carry its own inline queue that shared only
// FlagCard with the community queue. It has been pointed at the shared
// components/ModerationQueue. These tests pin the two things that matter:
// the admin route really is the shared component (not the old inline one),
// and its batch resolve issues one PATCH at a time against the 3-connection
// pool rather than a Promise.all fan-out.

const usersToClean: string[] = [];
const flagsToClean: string[] = [];

test.afterEach(async () => {
  // Flags before users: flags.reporterId is `onDelete: 'set null'`, so removing
  // the reporter first would strand the flag in the queue.
  for (const flagId of flagsToClean) {
    await deleteFlag(flagId).catch(() => {});
  }
  flagsToClean.length = 0;
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

async function signInAsAdmin(page: Page) {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);
  await signIn(page, admin.email, admin.password);
  return admin;
}

async function createGroup(page: Page, prefix: string) {
  const slug = slugify(prefix);
  const res = await page.request.post('/api/v1/groups', {
    data: {
      slug,
      name: `Admin queue ${prefix} ${Date.now()}`,
      visibility: 'public',
      color: '#000000',
    },
  });
  expect(res.status()).toBe(200);
  return slug;
}

async function createPost(page: Page, groupSlug: string) {
  const res = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug,
      title: `Admin queue post ${Date.now()}`,
      content: '<p>Body for the admin queue check.</p>',
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

test('the admin moderation route renders the shared queue, not the old inline one', async ({
  page,
}) => {
  await signInAsAdmin(page);

  const groupSlug = await createGroup(page, 'shared');
  const post = await createPost(page, groupSlug);
  const reason = `admin shared queue ${Date.now()}`;
  await createFlag(page, 'post', post.id, reason);

  await page.goto('/admin/moderation');
  await dismissOverlays(page);

  await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();

  // Open / History replaced the old three-way Open | Resolved | Dismissed bar.
  const queueView = page.getByRole('group', { name: 'Queue view' });
  await expect(queueView.getByRole('button', { name: 'Open' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(queueView.getByRole('button', { name: 'History' })).toBeVisible();

  // The inline page's server-round-trip filter button is gone; filters are live.
  await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);

  // Everything an admin could do before is still on the row.
  const row = page.getByTestId('flag-row').filter({ hasText: reason });
  await expect(row).toHaveCount(1);
  for (const name of ['View', 'Dismiss', 'Hide content', 'Warn user', 'Ban user']) {
    await expect(row.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel('Resolution note (applied to the next action)')).toBeVisible();
  await expect(page.getByLabel('Target type')).toBeVisible();
  await expect(page.getByLabel('Flag source')).toBeVisible();
  await expect(page.getByLabel('Search reason')).toBeVisible();
});

test('admin batch resolve sends one PATCH at a time', async ({ page }) => {
  await signInAsAdmin(page);

  const groupSlug = await createGroup(page, 'batch');
  const post = await createPost(page, groupSlug);
  const stamp = Date.now();
  const firstComment = await createComment(page, post.id, `batch comment one ${stamp}`);
  const secondComment = await createComment(page, post.id, `batch comment two ${stamp}`);

  const firstReason = `admin batch one ${stamp}`;
  const secondReason = `admin batch two ${stamp}`;
  await createFlag(page, 'comment', firstComment, firstReason);
  await createFlag(page, 'comment', secondComment, secondReason);

  // Hold each PATCH open long enough that a Promise.all fan-out would overlap.
  let inFlight = 0;
  let maxInFlight = 0;
  await page.route('**/api/v1/flags/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // route.fetch() resolves on the response, so inFlight tracks real overlap.
    const response = await route.fetch();
    inFlight -= 1;
    await route.fulfill({ response });
  });

  await page.goto('/admin/moderation');
  await dismissOverlays(page);

  const firstRow = page.getByTestId('flag-row').filter({ hasText: firstReason });
  const secondRow = page.getByTestId('flag-row').filter({ hasText: secondReason });
  await expect(firstRow).toHaveCount(1);
  await expect(secondRow).toHaveCount(1);

  // Select only these two flags — "Select all open" would sweep unrelated rows.
  await firstRow.getByRole('checkbox').check();
  await secondRow.getByRole('checkbox').check();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page.getByRole('button', { name: 'Batch dismiss' }).click();

  // Batch resolve merges each PATCH response into the list without refetching,
  // so the receipts are the completion signal rather than a racing reload.
  await expect(firstRow.getByTestId('resolution-receipt')).toBeVisible();
  await expect(secondRow.getByTestId('resolution-receipt')).toBeVisible();
  await expect(firstRow.getByTestId('resolution-receipt')).toContainText('by you');

  expect(maxInFlight).toBe(1);
});
