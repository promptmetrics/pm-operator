import { test, expect, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  createTestUser,
  deleteTestUser,
  serviceDb,
  signIn,
  slugify,
  dismissOverlays,
  type TestUser,
} from './helpers';

// Track 5C — the redesigned profile page (/u/{slug}).
//
// Points are asserted off the real economy rather than seeded numbers: a post
// awards topic_created (+10) attributed to the circle it lands in, which is
// exactly what the per-circle breakdown groups. streak_bonus is awarded too but
// carries no groupId, so it stays out of the breakdown by design — that is what
// makes the shares below exact.

const usersToClean: string[] = [];
const groupsToClean: string[] = [];
const badgesToClean: string[] = [];

test.afterEach(async () => {
  // Users first: posts and point_events cascade off both users and groups, and
  // deleting the user leaves the group empty rather than orphaning rows.
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;

  const db = serviceDb();
  if (groupsToClean.length > 0) {
    await db
      .delete(schema.groups)
      .where(inArray(schema.groups.id, groupsToClean))
      .catch(() => {});
    groupsToClean.length = 0;
  }
  if (badgesToClean.length > 0) {
    // user_badges cascades off badges.
    await db
      .delete(schema.badges)
      .where(inArray(schema.badges.id, badgesToClean))
      .catch(() => {});
    badgesToClean.length = 0;
  }
});

// Admin because this spec seeds its own circles through POST /api/v1/groups,
// and createGroup() rejects anyone who isn't an admin or moderator. The
// profile surfaces under test render identically for either role.
async function signInAsMember(page: Page): Promise<TestUser> {
  const user = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(user.id);
  await signIn(page, user.email, user.password);
  return user;
}

async function createGroup(page: Page, prefix: string, color: string) {
  const slug = slugify(prefix);
  const name = `Profile ${prefix} ${Date.now()}`;
  const res = await page.request.post('/api/v1/groups', {
    data: { slug, name, visibility: 'public', color },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  groupsToClean.push(body.data.id);
  return { id: body.data.id as string, slug, name };
}

/** One published post = one topic_created event = +10 points in `groupSlug`. */
async function createPost(page: Page, groupSlug: string, title: string) {
  const res = await page.request.post('/api/v1/posts', {
    data: {
      groupSlug,
      title,
      content: '<p>Body for the profile redesign spec.</p>',
      type: 'discussion',
      tags: [],
    },
  });
  expect(res.status()).toBe(200);
}

// Creates the badge through the admin API rather than inserting it directly:
// the badge catalog is served from a shared 300 s unstable_cache, and only the
// real create path calls revalidateBadgeCatalog(). A direct insert would stay
// invisible behind a warm cache entry left by an earlier test.
async function grantBadge(page: Page, userId: string, name: string): Promise<void> {
  const res = await page.request.post('/api/v1/admin/badges', {
    data: {
      slug: slugify('profile-badge'),
      name,
      description: 'Granted by the profile redesign spec.',
      criteria: { eventType: 'topic_created', threshold: 1_000_000 },
      sortOrder: 0,
    },
  });
  expect(res.status()).toBe(201);
  const badge = (await res.json()).data as { id: string };
  badgesToClean.push(badge.id);
  await serviceDb().insert(schema.userBadges).values({ userId, badgeId: badge.id });
}

test('the profile shows four stat tiles and a level progress bar', async ({ page }) => {
  const user = await signInAsMember(page);

  const circle = await createGroup(page, 'stats', '#3f8f82');
  await createPost(page, circle.slug, `Stat tile post ${Date.now()}`);

  await page.goto(`/u/${user.userslug}`);
  await dismissOverlays(page);

  const stats = page.getByRole('list', { name: 'Profile stats' });
  await expect(stats).toBeVisible();

  const tiles = stats.getByRole('listitem');
  await expect(tiles).toHaveCount(4);

  // Every tile carries its own label, so each one is addressable on its own.
  for (const label of ['Points', 'Posts', 'Solutions', 'Streak']) {
    await expect(tiles.filter({ hasText: label })).toHaveCount(1);
  }

  // Read each tile's number rather than substring-matching it: "10" is a
  // substring of "100", and only the value carries digits inside a tile.
  const tileValue = async (label: string) => {
    const text = (await tiles.filter({ hasText: label }).textContent()) ?? '';
    return Number(text.replace(/\D/g, ''));
  };

  expect(await tileValue('Posts')).toBe(1);
  expect(await tileValue('Solutions')).toBe(0);
  expect(await tileValue('Streak')).toBe(1);
  // The post is worth 10, and the first activity of the day also lands a
  // streak bonus, so pin the floor rather than an exact total.
  expect(await tileValue('Points')).toBeGreaterThanOrEqual(10);

  const progressSection = page.getByTestId('level-progress');
  await expect(progressSection).toBeVisible();
  await expect(progressSection).toContainText('Level progress');

  const bar = progressSection.getByRole('progressbar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuemax', '100');
  const valueNow = Number(await bar.getAttribute('aria-valuenow'));
  expect(valueNow).toBeGreaterThanOrEqual(0);
  expect(valueNow).toBeLessThanOrEqual(100);
});

test('earned badges render as chips in the header and in the achievements rail', async ({
  page,
}) => {
  const user = await signInAsMember(page);

  const first = `Ledger Wrangler ${Date.now()}`;
  const second = `Pipeline Plumber ${Date.now()}`;
  await grantBadge(page, user.id, first);
  await grantBadge(page, user.id, second);

  await page.goto(`/u/${user.userslug}`);
  await dismissOverlays(page);

  const chips = page.getByRole('list', { name: 'Badges earned' });
  await expect(chips).toBeVisible();

  const chipItems = chips.getByTestId('profile-badge-chip');
  await expect(chipItems).toHaveCount(2);
  await expect(chipItems.filter({ hasText: first })).toHaveCount(1);
  await expect(chipItems.filter({ hasText: second })).toHaveCount(1);

  // Two earned badges is under the chip cap, so no overflow pill.
  await expect(page.getByTestId('profile-badge-chip-overflow')).toHaveCount(0);

  const achievements = page.getByRole('region', { name: 'Achievements' });
  await expect(achievements).toContainText(first);
  await expect(achievements).toContainText(second);
});

test('the rail breaks points down per circle, ranked by share', async ({ page }) => {
  const user = await signInAsMember(page);

  const stamp = Date.now();
  const primary = await createGroup(page, 'primary', '#b8446a');
  const secondary = await createGroup(page, 'secondary', '#2f5675');

  // 2 posts (+20) in the primary circle, 1 post (+10) in the secondary — a 2:1
  // split, so the breakdown must read 67% / 33% in that order.
  await createPost(page, primary.slug, `Primary one ${stamp}`);
  await createPost(page, primary.slug, `Primary two ${stamp}`);
  await createPost(page, secondary.slug, `Secondary one ${stamp}`);

  await page.goto(`/u/${user.userslug}`);
  await dismissOverlays(page);

  const breakdown = page.getByTestId('circle-points-breakdown');
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText('Points by circle');

  const rows = breakdown.getByTestId('circle-points-row');
  await expect(rows).toHaveCount(2);

  const primaryRow = rows.filter({ hasText: primary.name });
  const secondaryRow = rows.filter({ hasText: secondary.name });
  await expect(primaryRow).toContainText('20 pts');
  await expect(primaryRow).toContainText('67%');
  await expect(secondaryRow).toContainText('10 pts');
  await expect(secondaryRow).toContainText('33%');

  // Ranked by points, so the bigger circle comes first.
  await expect(rows.first()).toContainText(primary.name);

  // Each row links through to its circle.
  await expect(breakdown.getByRole('link', { name: primary.name })).toHaveAttribute(
    'href',
    `/g/${primary.slug}`
  );
  await expect(breakdown.getByRole('link', { name: secondary.name })).toHaveAttribute(
    'href',
    `/g/${secondary.slug}`
  );
});

test('follow and message stay wired on another operator profile', async ({ page }) => {
  const target = await createTestUser({ onboardingComplete: true });
  usersToClean.push(target.id);
  await signInAsMember(page);

  await page.goto(`/u/${target.userslug}`);
  await dismissOverlays(page);

  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  await expect(follow).toBeVisible();
  await expect(page.getByRole('button', { name: 'Message' })).toBeVisible();

  // Wait on the write itself, then on the button's own state flip, before
  // reading the DB — asserting straight after the click would race the fetch.
  const [followResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes(`/api/v1/users/${target.userslug}/follow`) &&
        res.request().method() === 'POST'
    ),
    follow.click(),
  ]);
  expect(followResponse.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();

  const db = serviceDb();
  const rows = await db
    .select({ id: schema.follows.followeeId })
    .from(schema.follows)
    .where(eq(schema.follows.followeeId, target.id));
  expect(rows.length).toBe(1);
});
