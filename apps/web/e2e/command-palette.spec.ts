import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  dismissOverlays,
  createInviteOnlyGroup,
  slugify,
} from './helpers';

// ⌘K command palette (redesign plan §4). The palette mounts from the community
// layout, so every community page gets the hotkey.
//
// Locator policy: role-based locators with UNANCHORED name matches. Rows carry
// a kind pill and a meta column beside the title, so their accessible name is
// "<title> <meta> <kind>" — an anchored toHaveText would fail on the extras.

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

// A token unique per run. It must match exactly ONE palette row:
//   - circles  → ILIKE '%token%' against the seeded group name (1 hit)
//   - posts    → full-text search, no seeded post contains it (0 hits)
//   - people   → username PREFIX match, usernames are "Test <ts> <rand>" (0 hits)
function paletteToken() {
  return `Zqpalette${Date.now()}`;
}

test('⌘K opens the palette and ArrowDown+Enter navigates to a seeded circle', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  const token = paletteToken();
  const groupSlug = slugify('palette-circle');
  await createInviteOnlyGroup(user.id, groupSlug, `${token} Circle`);

  await signIn(page, user.email, user.password);
  await page.goto('/feed');
  await dismissOverlays(page);

  // The palette is not mounted until it is opened.
  await expect(page.getByRole('dialog')).toBeHidden();

  // ControlOrMeta resolves to ⌘ on macOS and Ctrl on the Linux CI runner.
  await page.keyboard.press('ControlOrMeta+k');

  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();

  // Focus moves to the combobox on open.
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();

  // Idle prompt before the 2-character minimum is met.
  await expect(palette).toContainText('Type at least 2 characters');

  await input.fill(token);

  // The result lands under the Circles group (role="group" + aria-label).
  const circles = palette.getByRole('group', { name: 'Circles' });
  const circleOption = circles.getByRole('option', { name: new RegExp(token) });
  await expect(circleOption).toBeVisible();

  // Rows carry a visible kind pill.
  await expect(circleOption).toContainText('Circle');

  // The token matches a single row, so ArrowDown wraps back onto it — this
  // still exercises the roving-highlight handler and leaves the assertion
  // deterministic (no dependence on cross-group result ordering).
  await page.keyboard.press('ArrowDown');
  await expect(circleOption).toHaveAttribute('aria-selected', 'true');

  // aria-activedescendant points the combobox at the highlighted row.
  const optionId = await circleOption.getAttribute('id');
  expect(optionId).toBeTruthy();
  await expect(input).toHaveAttribute('aria-activedescendant', optionId!);

  await page.keyboard.press('Enter');

  await page.waitForURL(`/g/${groupSlug}`);
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the header search pill opens the palette, and Escape closes it and restores focus', async ({
  page,
}) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);
  await page.goto('/feed');
  await dismissOverlays(page);

  // The desktop pill is named by its own text; the small-screen icon button is
  // labelled just "Search", so this regex cannot match both.
  const searchPill = page.getByRole('button', { name: /Search posts, circles, people/ });
  await expect(searchPill).toBeVisible();

  // While the palette is mounted the pill must NOT navigate to /search.
  await searchPill.click();

  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await expect(page).toHaveURL(/\/feed/);
  await expect(palette.getByRole('combobox')).toBeFocused();

  // A query with no matches shows the explicit empty state.
  const noMatch = `Zznothing${Date.now()}`;
  await palette.getByRole('combobox').fill(noMatch);
  await expect(palette).toContainText('No results for');

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/\/feed/);

  // Focus returns to the trigger that opened it.
  await expect(searchPill).toBeFocused();
});
