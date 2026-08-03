import { test, expect } from '@playwright/test';
import { dismissOverlays } from './helpers';

// Real-browser smoke test against the deployed production site. Does NOT use
// admin APIs or injected cookies — it exercises the same flows an end user
// would hit, including Supabase Auth rate limits and email confirmation.
// Skip unless explicitly requested because CI uses the test Supabase project.
test.skip(!process.env.RUN_PROD_E2E, 'Production E2E disabled in CI; set RUN_PROD_E2E=1 to run');

test.use({ baseURL: 'https://operator.promptmetrics.dev' });

test('anonymous post detail loads without 404/500', async ({ page }) => {
  const seededPostId = '20000000-0000-4000-8000-000000000002';
  await page.goto(`/p/${seededPostId}`);
  await dismissOverlays(page);
  await expect(page.getByText('Open-source MCP router we shipped last week')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible();
});

test('real email sign-up starts onboarding on production', async ({ page }) => {
  // Production Supabase Auth applies strict email rate limits; running this
  // repeatedly from automation will fail. Set PROD_AUTH_SMOKE=1 and space out
  // runs if you want to exercise the live sign-up path.
  test.skip(!process.env.PROD_AUTH_SMOKE, 'Skipped to avoid production auth rate limits');

  const timestamp = Date.now();
  const email = `prod.smoke.${timestamp}@example.com`;
  const password = 'Password123!';

  await page.goto('/register');
  await dismissOverlays(page);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // The app should not show a form-level error. After signup it either lands on
  // onboarding (auto-confirmed project) or on a confirmation-pending page.
  await expect(page.getByRole('alert')).not.toBeVisible();

  // If the project requires email confirmation, the URL will show a check-your-email
  // or similar page instead. We only assert we are no longer on /register and no error.
  await page.waitForURL(/\/(register\/complete|login|confirm|check-email)/, { timeout: 10_000 });

  // In the auto-confirm case, the header should reflect the logged-in user.
  if (page.url().includes('/register/complete')) {
    await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();
  }
});
