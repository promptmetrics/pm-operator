import { test, expect } from '@playwright/test';

/**
 * Regression cover for the incident that motivated the boundaries: with no
 * error.tsx anywhere, a throw inside /notifications reached Next's
 * DefaultGlobalError and blanked the entire document — header, rail and all.
 *
 * Both cases crash app/(community)/crash-test, which only responds when
 * E2E_TEST_ROUTES=1 (set by the E2E job in .github/workflows/ci.yml) and never
 * when VERCEL_ENV=production. See that page for the full guard rationale.
 *
 * No DB, no session: this spec deliberately does not import ./helpers, and
 * /crash-test is outside middleware's COMMUNITY_ROUTE_REGEX.
 */
const CRASH_ROUTE = '/crash-test';

const BOUNDARY_COPY = 'Something broke on this page.';

/** Literal error text the boundary must never surface. */
const LEAKED_STRINGS = [
  'crash-test',
  'deliberate server render failure',
  'deliberate client render failure',
  'CrashAfterHydration',
];

async function expectNoErrorDetailsLeak(bodyText: string) {
  for (const needle of LEAKED_STRINGS) {
    expect(bodyText, `boundary leaked "${needle}"`).not.toContain(needle);
  }
  // A rendered stack frame looks like "at Foo (/app/…)" or "at eval (webpack…".
  expect(bodyText, 'boundary leaked a stack frame').not.toMatch(/\bat\s+\S+\s+\(/);
  expect(bodyText, 'boundary leaked a source path').not.toContain('.tsx:');
}

test('a server-render crash is contained by the (community) boundary', async ({ page }) => {
  const response = await page.goto(CRASH_ROUTE);

  // Fail loudly rather than passing vacuously if the guard is not unlocked:
  // without E2E_TEST_ROUTES=1 the route is a 404 and there is nothing to catch.
  expect(
    response?.status(),
    'crash route is gated — set E2E_TEST_ROUTES=1 for the E2E run'
  ).not.toBe(404);

  await expect(page.getByRole('heading', { name: BOUNDARY_COPY })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to feed' })).toBeVisible();

  // The point of putting the boundary inside the (community) group: the layout
  // above it keeps rendering, so the failure is confined to the main column.
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  // Next attaches a digest to server-thrown errors; that is the support handle.
  await expect(page.getByTestId('route-error-id')).toBeVisible();

  await expectNoErrorDetailsLeak(await page.locator('body').innerText());
});

test('a post-hydration client crash is contained by the (community) boundary', async ({
  page,
}) => {
  const response = await page.goto(`${CRASH_ROUTE}?mode=client`);
  expect(
    response?.status(),
    'crash route is gated — set E2E_TEST_ROUTES=1 for the E2E run'
  ).not.toBe(404);

  // The server render succeeds here; the throw lands once React hydrates, so
  // let the locator wait for the swap rather than asserting straight after goto.
  await expect(page.getByRole('heading', { name: BOUNDARY_COPY })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to feed' })).toBeVisible();

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await expectNoErrorDetailsLeak(await page.locator('body').innerText());
});

test('the boundary offers a working way out of the crashed page', async ({ page }) => {
  const response = await page.goto(CRASH_ROUTE);
  expect(response?.status()).not.toBe(404);

  await expect(page.getByRole('heading', { name: BOUNDARY_COPY })).toBeVisible();

  await page.getByRole('link', { name: 'Go to feed' }).click();
  await page.waitForURL('/feed');
  await expect(page.getByRole('heading', { name: BOUNDARY_COPY })).toBeHidden();
});
