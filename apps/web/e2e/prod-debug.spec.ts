import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, dismissOverlays } from './helpers';
import { createClient } from '@supabase/supabase-js';

// These specs drive the live production site and need production Supabase
// credentials. Skip them unless explicitly requested.
test.skip(!process.env.RUN_PROD_E2E, 'Production E2E disabled in CI; set RUN_PROD_E2E=1 to run');

const usersToClean: string[] = [];

test.describe.configure({ mode: 'serial' });

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

// Drive the real production site using admin-created test users and injected
// session cookies. We want to see the exact API error responses from live.
test.use({ baseURL: 'https://operator.promptmetrics.dev' });

test('debug like, comment, join, create on production', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  // Sign in via admin API and inject session cookie for the production domain.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) throw error ?? new Error('failed to sign in debug user');

  const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const cookieName = `sb-${hostname}-auth-token`;
  await page.context().addCookies([
    {
      name: cookieName,
      value: JSON.stringify(data.session),
      domain: 'operator.promptmetrics.dev',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      secure: true,
    },
  ]);

  // Capture every failed network request.
  const failures: { url: string; status: number; body: string }[] = [];
  page.on('response', async (res) => {
    if (!res.ok()) {
      const req = res.request();
      try {
        const body = await res.text().catch(() => '');
        failures.push({ url: req.url(), status: res.status(), body: body.slice(0, 500) });
      } catch {}
    }
  });

  // Verify auth is active: the header should show the logged-in user, not CTAs.
  await page.goto('/feed');
  await dismissOverlays(page);
  await expect(page.getByText(user.username)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).not.toBeVisible();

  // 1. Join circle first — like/comment/create all require membership.
  await page.goto('/g/show-your-build');
  await dismissOverlays(page);
  await page.getByRole('button', { name: 'Join circle' }).click();
  await expect(page.getByRole('button', { name: 'Leave circle' })).toBeVisible();

  // 2. Open a seeded post and like it.
  await page.goto('/p/20000000-0000-4000-8000-000000000002');
  await dismissOverlays(page);
  await expect(page.getByText('Open-source MCP router we shipped last week')).toBeVisible();
  const likeButton = page.getByRole('button', { name: /upvotes/i });
  await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
  await dismissOverlays(page);
  await likeButton.click();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');

  // 3. Add a comment.
  await page.getByRole('button', { name: /Add a comment/i }).click();
  const commentBody = `Debug comment ${Date.now()}`;
  await page.locator('.ProseMirror').fill(`<p>${commentBody}</p>`);
  await dismissOverlays(page);
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText(commentBody)).toBeVisible();

  // 4. Create a new thread in the circle.
  await page.goto('/g/show-your-build');
  await dismissOverlays(page);
  await page.getByRole('button', { name: /Ask a question or show your build/i }).click();
  const postTitle = `Debug post ${Date.now()}`;
  await page.getByLabel('Title').fill(postTitle);
  await page.locator('#circle-select').selectOption('show-your-build');
  await page.locator('.ProseMirror').fill('<p>Debug body</p>');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.waitForTimeout(500);
  await page.goto('/g/show-your-build');
  await expect(page.getByText(postTitle).first()).toBeVisible();

  console.log('=== FAILED REQUESTS ===');
  for (const f of failures) {
    console.log(`${f.status} ${f.url}\n${f.body}\n---`);
  }

  // Fail deliberately so the attachment captures the console output.
  expect(failures).toHaveLength(0);
});
