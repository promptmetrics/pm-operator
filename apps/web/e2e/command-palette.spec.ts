import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  dismissOverlays,
  createInviteOnlyGroup,
  createPublishedPost,
  deleteGroup,
  slugify,
} from './helpers';

// ⌘K command palette (redesign plan §4). The palette mounts from the community
// layout, so every community page gets the hotkey.
//
// Locator policy: role-based locators with UNANCHORED name matches. Rows carry
// a kind pill and a meta column beside the title, so their accessible name is
// "<title> <meta> <kind>" — an anchored toHaveText would fail on the extras.

const usersToClean: string[] = [];
const groupsToClean: string[] = [];

test.afterEach(async () => {
  // posts.author_id and posts.group_id are both ON DELETE CASCADE, so the
  // seeded post goes with its author; the group is dropped after.
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
  for (const groupId of groupsToClean) {
    await deleteGroup(groupId).catch(() => {});
  }
  groupsToClean.length = 0;
});

// A token unique per run, seeded into all THREE palette buckets so arrow
// stepping crosses real group boundaries:
//   - circles → ILIKE '%token%' against the seeded group name
//   - posts   → to_tsquery('simple', 'token:*') against title || content_plain
//   - people  → username PREFIX match against the signed-in user's username
//
// Letters only, deliberately: a digits-and-letters token parses as a single
// `numword`, which is fine today but leaves the FTS bucket hostage to text
// parser behaviour. Digits are mapped to letters so the token stays unique
// without carrying any. The random tail matters — two parallel workers can
// share a Date.now(), and a duplicate token would seed two circles and shift
// every row index below.
const DIGIT_LETTERS = 'abcdefghij';

function paletteToken() {
  const toLetters = (s: string) => s.replace(/\d/g, (d) => DIGIT_LETTERS[Number(d)]);
  return `Zqpalette${toLetters(String(Date.now()))}${toLetters(Math.random().toString(36).slice(2, 8))}`;
}

test('⌘K opens the palette and ArrowDown steps the highlight across group boundaries', async ({
  page,
}) => {
  const token = paletteToken();

  // The signed-in user IS the seeded Person row: people match on a username
  // prefix, so the token has to lead the username.
  const user = await createTestUser({
    onboardingComplete: true,
    username: `${token} Operator`,
  });
  usersToClean.push(user.id);

  const groupSlug = slugify('palette-circle');
  const group = await createInviteOnlyGroup(user.id, groupSlug, `${token} Circle`);
  groupsToClean.push(group.id);

  // Membership (createInviteOnlyGroup makes the creator an admin) is what makes
  // the post visible to postVisibilityFilter inside the palette's FTS bucket.
  const postTitle = `${token} runbook`;
  await createPublishedPost(group.id, user.id, postTitle);

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

  // One row per bucket, each under its own group (role="group" + aria-label).
  // Row order is fixed by the palette: Circles → Posts → People.
  const tokenRow = new RegExp(token);
  const circleOption = palette.getByRole('group', { name: 'Circles' }).getByRole('option', {
    name: tokenRow,
  });
  const postOption = palette.getByRole('group', { name: 'Posts' }).getByRole('option', {
    name: tokenRow,
  });
  const personOption = palette.getByRole('group', { name: 'People' }).getByRole('option', {
    name: tokenRow,
  });

  // Wait for all three buckets before touching the keyboard — the debounced
  // fetch resolves them in one response, and stepping early would race it.
  await expect(circleOption).toBeVisible();
  await expect(postOption).toBeVisible();
  await expect(personOption).toBeVisible();

  // Rows carry a visible kind pill.
  await expect(circleOption).toContainText('Circle');
  await expect(postOption).toContainText('Post');
  await expect(personOption).toContainText('Person');

  const circleId = await circleOption.getAttribute('id');
  const postId = await postOption.getAttribute('id');
  const personId = await personOption.getAttribute('id');
  expect(circleId).toBeTruthy();
  expect(postId).toBeTruthy();
  expect(personId).toBeTruthy();
  // Distinct ids — otherwise the aria-activedescendant assertions below would
  // pass even if the highlight never moved.
  expect(new Set([circleId, postId, personId]).size).toBe(3);

  // The highlight starts on the first row of the first group.
  await expect(circleOption).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', circleId!);

  // Boundary 1: Circles → Posts. The old single-row seed could not tell this
  // apart from ArrowDown wrapping onto the same row.
  await page.keyboard.press('ArrowDown');
  await expect(postOption).toHaveAttribute('aria-selected', 'true');
  await expect(circleOption).toHaveAttribute('aria-selected', 'false');
  await expect(input).toHaveAttribute('aria-activedescendant', postId!);

  // Boundary 2: Posts → People.
  await page.keyboard.press('ArrowDown');
  await expect(personOption).toHaveAttribute('aria-selected', 'true');
  await expect(postOption).toHaveAttribute('aria-selected', 'false');
  await expect(input).toHaveAttribute('aria-activedescendant', personId!);

  // ArrowUp walks the same boundary back.
  await page.keyboard.press('ArrowUp');
  await expect(postOption).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', postId!);

  // Enter opens the HIGHLIGHTED row, not the first one: /p/[id] resolves the
  // slug and redirects to the canonical /g/{circleSlug}/{postSlug}.
  await page.keyboard.press('Enter');

  // A post segment after the circle slug — /g/{groupSlug} alone would mean the
  // Circles row (index 0) had been activated instead.
  await page.waitForURL(new RegExp(`/g/${groupSlug}/[^/?#]+`));
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: postTitle })).toBeVisible();
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
