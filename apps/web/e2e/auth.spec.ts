import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  uniqueEmail,
  serviceSupabase,
  serviceDb,
  dismissOverlays,
} from './helpers';
import { users } from '@pm-operator/db';
import { eq } from 'drizzle-orm';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('email sign-up creates a user and starts onboarding', async ({ page }) => {
  // The browser sign-up flow is exercised in local-only checks; in CI against
  // the live Supabase project the auth endpoint rate limits make it flaky,
  // so we create the confirmed user via the admin API and verify onboarding.
  const user = await createTestUser({ onboardingComplete: false });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);

  // Onboarding is required before protected routes.
  await page.waitForURL(/\/register\/complete/);

  const dbUser = await serviceDb().query.users.findFirst({
    where: eq(users.email, user.email),
    columns: { id: true },
  });
  expect(dbUser).toBeTruthy();
});

test('onboarding can be completed and redirects to the requested page', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: false });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);
  await page.waitForURL(/\/register\/complete/);

  await page.locator('#painful-tool-stack-task').fill('End-to-end onboarding test');
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="onboarding-form"]') as HTMLFormElement | null;
    form?.requestSubmit();
  });
  await page.waitForURL('/settings');
});

test('forgot-password flow shows a confirmation message', async ({ page }) => {
  // Cloudflare challenge modals intercept clicks on the live production domain
  // from GitHub-hosted runners, so this UI copy test is skipped in CI.
  test.skip(!!process.env.CI, 'skipped in CI due to Cloudflare challenge modal');

  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  await page.goto('/forgot-password?returnUrl=%2Ffeed');
  await page.locator('#email').fill(user.email);
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText('If an account exists')).toBeVisible();
});

test('returnUrl is preserved through login and onboarding', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: false });
  usersToClean.push(user.id);

  await page.goto('/settings');
  await page.waitForURL(/\/login/);
  const url = new URL(page.url());
  expect(url.searchParams.get('returnUrl')).toBe('/settings');

  await signIn(page, user.email, user.password);
  await page.waitForURL(/\/register\/complete/);

  await page.locator('#painful-tool-stack-task').fill('ReturnUrl onboarding test');
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="onboarding-form"]') as HTMLFormElement | null;
    form?.requestSubmit();
  });
  await page.waitForURL('/settings');
});
