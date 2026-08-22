import { test, expect } from '@playwright/test';
import {
  countPointEvents,
  createTestUser,
  deleteTestUser,
  dismissOverlays,
  signIn,
} from './helpers';

// SEO plan Phase 3: the settings bio bonus. Writes to the DB (PATCH /api/v1/me
// + point event), so per the prod-DB trap this runs in CI only — never against
// a local dev server whose .env.local points at production.
//
// Covers: save with a ≥50-char bio → +5 pts award → badge flips to earned;
// reload keeps the earned badge; a second save does NOT insert a second
// profile_bio event (the partial unique index is the guard).

const BIO =
  'RevOps lead at Northwind, a 40-person B2B SaaS. I run HubSpot and Outreach.';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('bio save awards +5 once and flips the badge to earned', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);
  await signIn(page, user.email, user.password);
  await dismissOverlays(page);

  const main = page.getByRole('main');

  // Pending state before any save.
  await expect(main.getByText('+5 pts on first save')).toBeVisible();

  await main.locator('#aboutMe').fill(BIO);
  await expect(main.getByText(`${BIO.trim().length} characters`)).toBeVisible();

  await main.getByRole('button', { name: 'Save changes' }).click();
  await expect(main.getByRole('status')).toBeVisible();

  // Badge flips without a reload.
  await expect(main.getByText('✓ +5 pts earned')).toBeVisible();
  await expect(main.getByText('+5 pts on first save')).toHaveCount(0);

  // Exactly one profile_bio event after the first save.
  await expect.poll(() => countPointEvents(user.id, 'profile_bio')).toBe(1);

  // Reload: the earned badge comes from the server (bioBonusEarned), and a
  // second save still does not insert another event.
  await page.reload();
  await dismissOverlays(page);
  await expect(main.getByText('✓ +5 pts earned')).toBeVisible();

  await main.getByRole('button', { name: 'Save changes' }).click();
  await expect(main.getByRole('status')).toBeVisible();
  await expect.poll(() => countPointEvents(user.id, 'profile_bio')).toBe(1);

  // Headline and links round-trip through PATCH and render on /u/[slug].
  await main.locator('#headline').fill('RevOps lead, Northwind');
  await main.getByRole('button', { name: 'Save changes' }).click();
  await expect(main.getByRole('status')).toBeVisible();

  await page.goto(`/u/${user.userslug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(user.username);
  await expect(page.getByText('RevOps lead, Northwind')).toBeVisible();
  await expect(page.getByText(BIO)).toBeVisible();
});
