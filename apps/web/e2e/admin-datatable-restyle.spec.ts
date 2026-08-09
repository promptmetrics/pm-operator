import { test, expect, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  createTestUser,
  deleteTestUser,
  seedLeaderboardScore,
  serviceDb,
  signIn,
  dismissOverlays,
} from './helpers';

// Phase 6 / track 6B — the admin detail tables now render through the restyled
// DataTable. /admin/users is the representative table: it is the only one of the
// seven that exercises sorting, filtering, per-row actions and bulk actions at
// once. Pagination is asserted against /admin/leaderboards, which is where
// DataTable's own pager is actually wired to page/hasMore/onPageChange.
//
// Every assertion here is about behaviour that existed before the restyle. The
// point of the spec is that the markup moved from a <Card> grid to a real
// <table> without any capability moving with it.

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

async function signInAsAdmin(page: Page) {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);
  await signIn(page, admin.email, admin.password);
  return admin;
}

/**
 * adminListUsers matches `q` against username / userslug / email only, so the
 * marker has to live in the username for the search box to narrow to exactly
 * the users this test seeded. fullName is set to match because the Name column
 * renders `fullName || username`.
 */
async function seedNamedUser(
  marker: string,
  displayName: string,
  role: 'member' | 'moderator' | 'admin'
) {
  const user = await createTestUser({ role, onboardingComplete: true });
  usersToClean.push(user.id);
  const username = `${displayName} ${marker}`;
  await serviceDb()
    .update(schema.users)
    .set({ username, fullName: username })
    .where(eq(schema.users.id, user.id));
  return { ...user, username };
}

/**
 * Narrow the users table to just this test's fixtures and hand back the table.
 * The search is debounced and server-side, so wait for the response that
 * actually carries the marker rather than reading through the refetch window.
 */
async function openUsersTableFiltered(page: Page, marker: string) {
  await page.goto('/admin/users');
  await dismissOverlays(page);
  const searched = page.waitForResponse(
    (res) => res.url().includes('/api/v1/admin/users') && res.url().includes(`q=${marker}`)
  );
  await page.getByPlaceholder('Search by name').fill(marker);
  await searched;
  return page.getByRole('table', { name: 'Users' });
}

/** Row position within the table, header row included, or -1 when absent. */
async function rowIndexOf(table: Locator, needle: string): Promise<number> {
  const rows = table.getByRole('row');
  const total = await rows.count();
  for (let i = 0; i < total; i++) {
    const text = await rows.nth(i).innerText();
    if (text.includes(needle)) return i;
  }
  return -1;
}

test('the users list renders as a real table with labelled column headers', async ({ page }) => {
  const marker = `dtheaders${Date.now()}`;
  await signInAsAdmin(page);
  const operator = await seedNamedUser(marker, 'Acme Operator', 'member');

  const table = await openUsersTableFiltered(page, marker);
  await expect(table.getByRole('row').filter({ hasText: operator.username })).toHaveCount(1);

  for (const header of ['Name / Username', 'Email', 'Role', 'Rep', 'Joined', 'Actions']) {
    await expect(table.getByRole('columnheader', { name: header })).toHaveCount(1);
  }

  // The page owns its own search field, so DataTable's built-in one stays out
  // of the DOM — there is exactly one search control, not two.
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('a sortable column header reorders the rows and reports its direction', async ({ page }) => {
  const marker = `dtsort${Date.now()}`;
  await signInAsAdmin(page);
  const alpha = await seedNamedUser(marker, 'Aaa Operator', 'member');
  const zulu = await seedNamedUser(marker, 'Zzz Operator', 'member');

  const table = await openUsersTableFiltered(page, marker);
  // Header row plus exactly the two fixtures — the ordering checks below read a
  // settled table, not one mid-refetch.
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').filter({ hasText: alpha.username })).toHaveCount(1);
  await expect(table.getByRole('row').filter({ hasText: zulu.username })).toHaveCount(1);

  // The table lands sorted by Joined (descending), so Name starts unsorted.
  const nameHeader = table.getByRole('columnheader', { name: 'Name / Username' });
  await expect(nameHeader).toHaveAttribute('aria-sort', 'none');

  await nameHeader.getByRole('button').click();
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  expect(await rowIndexOf(table, alpha.username)).toBeLessThan(
    await rowIndexOf(table, zulu.username)
  );

  // Sorting is client-side here, so a second click flips the same rows.
  await nameHeader.getByRole('button').click();
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
  expect(await rowIndexOf(table, zulu.username)).toBeLessThan(
    await rowIndexOf(table, alpha.username)
  );
});

test('the role filter narrows the table to matching rows', async ({ page }) => {
  const marker = `dtfilter${Date.now()}`;
  await signInAsAdmin(page);
  const member = await seedNamedUser(marker, 'Member Operator', 'member');
  const moderator = await seedNamedUser(marker, 'Mod Operator', 'moderator');

  const table = await openUsersTableFiltered(page, marker);
  const memberRow = table.getByRole('row').filter({ hasText: member.username });
  const moderatorRow = table.getByRole('row').filter({ hasText: moderator.username });
  await expect(memberRow).toHaveCount(1);
  await expect(moderatorRow).toHaveCount(1);

  // exact: true — every row also carries a "Role for <name>" select.
  await page.getByLabel('Role', { exact: true }).selectOption('moderator');

  // The filter refetches on a debounce; these locators poll until it lands.
  await expect(moderatorRow).toHaveCount(1);
  await expect(memberRow).toHaveCount(0);

  await page.getByLabel('Role', { exact: true }).selectOption('');
  await expect(memberRow).toHaveCount(1);
});

test('the per-row role control still writes the change through', async ({ page }) => {
  const marker = `dtrowaction${Date.now()}`;
  await signInAsAdmin(page);
  const member = await seedNamedUser(marker, 'Promote Operator', 'member');

  const table = await openUsersTableFiltered(page, marker);
  const row = table.getByRole('row').filter({ hasText: member.username });
  await expect(row).toHaveCount(1);

  const roleControl = row.getByLabel(`Role for ${member.username}`);
  await expect(roleControl).toHaveValue('member');

  const patched = page.waitForResponse(
    (res) => res.url().includes('/api/v1/admin/users') && res.request().method() === 'PATCH'
  );
  await roleControl.selectOption('moderator');
  await patched;

  // The control is bound to the fetched row, so it snaps back until the reload
  // lands. Re-open the page instead of asserting into that window.
  const reloaded = await openUsersTableFiltered(page, marker);
  const reloadedRow = reloaded.getByRole('row').filter({ hasText: member.username });
  await expect(reloadedRow.getByLabel(`Role for ${member.username}`)).toHaveValue('moderator');
});

test('bulk selection drives the bulk role bar across every selected row', async ({ page }) => {
  const marker = `dtbulk${Date.now()}`;
  await signInAsAdmin(page);
  const first = await seedNamedUser(marker, 'Bulk One', 'member');
  const second = await seedNamedUser(marker, 'Bulk Two', 'member');

  const table = await openUsersTableFiltered(page, marker);
  const firstRow = table.getByRole('row').filter({ hasText: first.username });
  const secondRow = table.getByRole('row').filter({ hasText: second.username });
  await expect(firstRow).toHaveCount(1);
  await expect(secondRow).toHaveCount(1);

  // Select-all covers exactly the rows the filter left on screen.
  await table.getByRole('button', { name: 'Select all rows' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  // Per-row toggles come off and go back on again.
  await firstRow.getByRole('button', { name: 'Select row' }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await firstRow.getByRole('button', { name: 'Select row' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page.getByRole('button', { name: 'moderator', exact: true }).click();

  // The bar clears once the bulk writes finish and the list refetches.
  await expect(page.getByText('2 selected')).toHaveCount(0);

  const reloaded = await openUsersTableFiltered(page, marker);
  for (const user of [first, second]) {
    const row = reloaded.getByRole('row').filter({ hasText: user.username });
    await expect(row.getByLabel(`Role for ${user.username}`)).toHaveValue('moderator');
  }
});

test('DataTable pagination still renders and disables Previous on the first page', async ({
  page,
}) => {
  const admin = await signInAsAdmin(page);
  await seedLeaderboardScore(admin.id, 250);

  await page.goto('/admin/leaderboards');
  await dismissOverlays(page);

  const table = page.getByRole('table');
  await expect(table.getByRole('row').first()).toBeVisible();

  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination).toBeVisible();
  await expect(pagination).toContainText('Page 1');
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeVisible();
});
