import { test, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  serviceDb,
  createTestUser,
  deleteTestUser,
  signIn,
  slugify,
  dismissOverlays,
} from './helpers';

// Feed onboarding checklist (plan §4.7). CI-only: needs the app server and the
// test database. Covers the three behaviours the 70% onboarding-completion
// target depends on — the card shows up for a fresh member, its progress
// tracks real activity, and dismissing it sticks across a reload.

const db = serviceDb();

const usersToClean: string[] = [];
const groupsToClean: string[] = [];

test.afterEach(async () => {
  for (const groupId of groupsToClean) {
    await db.delete(schema.groups).where(eq(schema.groups.id, groupId)).catch(() => {});
  }
  groupsToClean.length = 0;
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('onboarding checklist: renders fresh, tracks progress, dismissal persists', async ({
  page,
}) => {
  // Admin role only so the test can create circles through the API; the
  // checklist itself is role-independent. The user starts with no
  // memberships, no posts and no comments — i.e. 0/3.
  const user = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);
  await page.goto('/feed');
  await dismissOverlays(page);

  const checklist = page.getByTestId('onboarding-checklist');
  await expect(checklist).toBeVisible();
  await expect(page.getByTestId('onboarding-progress')).toHaveText('0/3');

  // Each incomplete step deep-links to where it gets done.
  await expect(checklist.getByRole('link', { name: 'Browse circles' })).toHaveAttribute(
    'href',
    '/g'
  );
  await expect(checklist.getByRole('link', { name: 'Start a post' })).toHaveAttribute(
    'href',
    '/post/new'
  );

  // Creating a circle auto-joins the creator, so two circles complete step 1.
  const slugs: string[] = [];
  for (const label of ['one', 'two']) {
    const groupSlug = slugify(`checklist-${label}`);
    const res = await page.request.post('/api/v1/groups', {
      data: {
        slug: groupSlug,
        name: `Checklist ${label} ${groupSlug}`,
        visibility: 'public',
        color: '#000000',
      },
    });
    expect(res.status()).toBe(200);
    groupsToClean.push((await res.json()).data.id);
    slugs.push(groupSlug);
  }

  await page.reload();
  await dismissOverlays(page);
  await expect(page.getByTestId('onboarding-progress')).toHaveText('1/3');

  // Second step: the viewer's first post.
  const postRes = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug: slugs[0],
      title: 'Checklist test post',
      content: '<p>Checklist test content</p>',
      type: 'discussion',
      tags: [],
    },
  });
  expect(postRes.status()).toBe(200);

  await page.reload();
  await dismissOverlays(page);
  await expect(page.getByTestId('onboarding-progress')).toHaveText('2/3');

  // Dismissing writes preferences.checklistDismissed through /api/v1/me, so
  // the card stays gone (and the feed page stops querying for it).
  await checklist.getByRole('button', { name: 'Dismiss checklist' }).click();
  await expect(checklist).toBeHidden();

  await page.reload();
  await dismissOverlays(page);
  await expect(page.getByTestId('onboarding-checklist')).toHaveCount(0);

  const stored = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { preferences: true },
  });
  expect((stored?.preferences as Record<string, unknown>)?.checklistDismissed).toBe(true);
});
