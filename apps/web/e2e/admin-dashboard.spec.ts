import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  createPublicGroup,
  createPublishedPost,
  createTestUser,
  deleteFlag,
  deleteGroup,
  deleteTestUser,
  serviceDb,
  signIn,
} from './helpers';

/**
 * Admin dashboard (analytics v2, §4.5): the four week-over-week tiles, the
 * seven-day posts chart, the newest-members list, and the needs-attention
 * deep links.
 *
 * The dashboard reports on the whole community, so every assertion here is
 * existence-based — it looks for the rows this spec seeded and never for exact
 * totals, which any other row in the database would shift.
 */

const usersToClean: string[] = [];
const groupsToClean: string[] = [];
const flagsToClean: string[] = [];

test.afterEach(async () => {
  // Flags first: flags.reporterId is `onDelete: 'set null'`, so removing the
  // reporter first would strand an open flag in the queue. Groups next, which
  // cascade their posts. Users last.
  for (const flagId of flagsToClean) {
    await deleteFlag(flagId).catch(() => {});
  }
  flagsToClean.length = 0;
  for (const groupId of groupsToClean) {
    await deleteGroup(groupId).catch(() => {});
  }
  groupsToClean.length = 0;
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * The "needs attention" queries only pick up rows past a qualifying age (24h
 * for a stalled signup, 48h for an unanswered question), and each kind is
 * capped at five. Backdating is how a freshly seeded row both qualifies and
 * sorts to the front of that cap, so the assertions do not depend on how much
 * other data the database happens to hold.
 */
async function backdateUser(userId: string, hours: number): Promise<void> {
  await serviceDb()
    .update(schema.users)
    .set({ createdAt: hoursAgo(hours) })
    .where(eq(schema.users.id, userId));
}

async function backdatePost(postId: string, hours: number): Promise<void> {
  await serviceDb()
    .update(schema.posts)
    .set({ createdAt: hoursAgo(hours) })
    .where(eq(schema.posts.id, postId));
}

async function backdateFlag(flagId: string, hours: number): Promise<void> {
  await serviceDb()
    .update(schema.flags)
    .set({ createdAt: hoursAgo(hours) })
    .where(eq(schema.flags.id, flagId));
}

async function signInAsAdmin(page: Page) {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);
  await signIn(page, admin.email, admin.password);
  return admin;
}

/**
 * The page swaps its skeleton for content only once the single analytics
 * request resolves, so every test waits on a rendered section heading rather
 * than asserting straight after navigation.
 */
async function openDashboard(page: Page) {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Posts per day' })).toBeVisible();
}

test('the dashboard shows four week-over-week tiles and a seven-day posts chart', async ({
  page,
}) => {
  const admin = await signInAsAdmin(page);
  const group = await createPublicGroup(admin.id);
  groupsToClean.push(group.id);
  await createPublishedPost(group.id, admin.id, `Dashboard chart post ${Date.now()}`);

  await openDashboard(page);

  for (const title of [
    'Posts created',
    'Solved rate',
    'Active members',
    'Median first answer',
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  const chart = page.getByRole('list', { name: 'Posts per day' });
  const bars = chart.getByRole('listitem');
  await expect(bars).toHaveCount(7);

  // The final bucket is today, which is where the post seeded above landed.
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  await expect(bars.last()).toContainText(today);
});

test('newest members shows the onboarding pill and source, and links to the profile', async ({
  page,
}) => {
  const admin = await signInAsAdmin(page);
  // No onboardingComplete: the seeded user has an empty painful-tool-stack
  // answer, which is what the dashboard reads as a stalled onboarding.
  const stalled = await createTestUser({ role: 'member' });
  usersToClean.push(stalled.id);

  await openDashboard(page);

  const list = page.getByRole('list', { name: 'Newest members' });

  const stalledRow = list.getByRole('link', { name: stalled.username });
  await expect(stalledRow).toBeVisible();
  await expect(stalledRow).toHaveAttribute('href', `/u/${stalled.userslug}`);
  await expect(stalledRow).toContainText('Stalled');
  // Neither seeded user has an OAuth id, so both are attributed to an invite.
  await expect(stalledRow).toContainText('Invite');

  const adminRow = list.getByRole('link', { name: admin.username });
  await expect(adminRow).toHaveAttribute('href', `/u/${admin.userslug}`);
  await expect(adminRow).toContainText('Onboarded');
});

test('needs attention deep-links each item to the place that resolves it', async ({
  page,
}) => {
  const admin = await signInAsAdmin(page);
  const group = await createPublicGroup(admin.id);
  groupsToClean.push(group.id);

  // An open flag resolves in the moderation queue, which is not addressable
  // per flag.
  const flaggedPostId = await createPublishedPost(
    group.id,
    admin.id,
    `Dashboard flagged post ${Date.now()}`
  );
  const flagReason = `Dashboard deep link ${Date.now()}`;
  const flagResponse = await page.request.post('/api/v1/flags', {
    data: { targetType: 'post', targetId: flaggedPostId, reason: flagReason },
  });
  expect(flagResponse.status()).toBe(200);
  const flagId = (await flagResponse.json()).data.id as string;
  flagsToClean.push(flagId);
  // Open flags are listed oldest first, so this one is aged to the front.
  await backdateFlag(flagId, 24 * 400);

  // An unanswered question resolves on the post itself.
  const questionTitle = `Dashboard unanswered question ${Date.now()}`;
  const questionResponse = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug: group.slug,
      title: questionTitle,
      content: '<p>Still waiting on an answer.</p>',
      type: 'question',
      tags: [],
    },
  });
  expect(questionResponse.status()).toBe(200);
  const questionId = (await questionResponse.json()).data.id as string;
  // Unanswered questions qualify after 48h and are listed oldest first.
  await backdatePost(questionId, 24 * 400);

  // A stalled signup resolves on the member. Stalled signups are listed newest
  // first, so this one sits just past the 24h qualifying line.
  const stalled = await createTestUser({ role: 'member' });
  usersToClean.push(stalled.id);
  await backdateUser(stalled.id, 25);

  await openDashboard(page);

  const list = page.getByRole('list', { name: 'Needs attention' });

  await expect(list.getByRole('link', { name: flagReason })).toHaveAttribute(
    'href',
    '/moderation'
  );
  await expect(list.getByRole('link', { name: questionTitle })).toHaveAttribute(
    'href',
    `/p/${questionId}`
  );
  // The public profile resolves by userslug and this row carries a user id, so
  // the admin member page is the deep link that can actually be followed.
  await expect(list.getByRole('link', { name: stalled.username })).toHaveAttribute(
    'href',
    `/admin/users/${stalled.id}`
  );
});
