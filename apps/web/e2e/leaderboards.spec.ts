import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  dismissOverlays,
  seedLeaderboardScore,
  type TestUser,
} from './helpers';

// Track 5B: leaderboards redesign — 4 board chips, 2 · 1 · 3 podium, trimmed
// rank/member/score table, viewer row with a YOU chip.
//
// The boards are global, so the fixtures are seeded far above anything the demo
// seed can produce; that makes "who is on the podium" deterministic without
// deleting other people's scores. Rank ORDER is asserted from data-rank rather
// than from cell text so a tie in the surrounding data can't break the spec.
const TOP = 9_000_000;

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

async function seedRankedUser(score: number, streakDays: number): Promise<TestUser> {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);
  await seedLeaderboardScore(user.id, score, { streakDays });
  return user;
}

function boards(page: Page) {
  return page.getByTestId('leaderboard-boards');
}

async function openLeaderboards(page: Page, viewer: TestUser) {
  await signIn(page, viewer.email, viewer.password);
  await page.goto('/leaderboards');
  await dismissOverlays(page);
}

test('podium renders the top three in 2 · 1 · 3 order and crowns the weekly winner', async ({
  page,
}) => {
  const first = await seedRankedUser(TOP, 30);
  const second = await seedRankedUser(TOP - 1, 20);
  const third = await seedRankedUser(TOP - 2, 10);
  // The viewer cannot stay scoreless: the Header auto-awards daily-visit
  // points on the first authenticated page render, so they may trail the
  // list as a low-score row. Their tiny score can never crack the podium,
  // which is what the assertions below actually pin.
  const viewer = await createTestUser({ onboardingComplete: true });
  usersToClean.push(viewer.id);

  await openLeaderboards(page, viewer);

  const tiles = page.getByTestId('podium-tile');
  await expect(tiles).toHaveCount(3);

  // Visual order is 2nd, 1st, 3rd — the winner is the centre tile.
  await expect(tiles.nth(0)).toHaveAttribute('data-rank', '2');
  await expect(tiles.nth(1)).toHaveAttribute('data-rank', '1');
  await expect(tiles.nth(2)).toHaveAttribute('data-rank', '3');
  await expect(tiles.nth(1)).toHaveAttribute('data-slot', 'first');

  await expect(tiles.nth(0)).toContainText(second.username);
  await expect(tiles.nth(1)).toContainText(first.username);
  await expect(tiles.nth(2)).toContainText(third.username);

  // Crown treatment is weekly-only and belongs to first place.
  await expect(tiles.nth(1)).toContainText('Operator of the week');
  await expect(tiles.nth(0)).not.toContainText('Operator of the week');
  await expect(tiles.nth(2)).not.toContainText('Operator of the week');

  // Trimmed table: rank · member · score rows, and no uppercase header row
  // (reference has none).
  await expect(page.getByTestId('leaderboard-table').getByRole('columnheader')).toHaveCount(0);
  // Exact row count is a race: the viewer's automatic daily-visit award may
  // or may not have landed before render (it flipped when the editor
  // code-split sped up hydration — CI 2026-08-21). The stable pin is the
  // seeded order at the top of the table.
  const rows = page.getByTestId('leaderboard-row');
  await expect(rows.nth(0)).toContainText(first.username);
  await expect(rows.nth(1)).toContainText(second.username);
  await expect(rows.nth(2)).toContainText(third.username);
});

test('board chips switch boards and re-label the score column', async ({ page }) => {
  await seedRankedUser(TOP, 30);
  await seedRankedUser(TOP - 1, 20);
  await seedRankedUser(TOP - 2, 10);
  const viewer = await createTestUser({ onboardingComplete: true });
  usersToClean.push(viewer.id);

  await openLeaderboards(page, viewer);

  const chips = boards(page).getByRole('button');
  await expect(chips).toHaveCount(4);

  const weekly = boards(page).getByRole('button', { name: /this week/i });
  const allTime = boards(page).getByRole('button', { name: /all time/i });
  const solutions = boards(page).getByRole('button', { name: /most solutions/i });
  const streaks = boards(page).getByRole('button', { name: /longest streaks/i });

  await expect(weekly).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('leaderboard-row').first()).toContainText('pts');

  // All-time is still a points board, but the crown is weekly-only.
  await allTime.click();
  await expect(allTime).toHaveAttribute('aria-pressed', 'true');
  await expect(weekly).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('podium-tile')).toHaveCount(3);
  await expect(page.getByTestId('podium-tile').nth(1)).not.toContainText('Operator of the week');
  await expect(page.getByTestId('leaderboard-row').first()).toContainText('pts');

  // The solutions/streaks boards rank by their own metric, so the score column
  // has to show that metric rather than the points total.
  await solutions.click();
  await expect(solutions).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('leaderboard-row').first()).toContainText('solution');

  await streaks.click();
  await expect(streaks).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('leaderboard-row').first()).toContainText('day');

  // Switching back reads from the client cache — the weekly crown returns.
  await weekly.click();
  await expect(weekly).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('podium-tile').nth(1)).toContainText('Operator of the week');
});

test('the viewer row is highlighted with a YOU chip', async ({ page }) => {
  await seedRankedUser(TOP, 30);
  await seedRankedUser(TOP - 1, 20);
  await seedRankedUser(TOP - 2, 10);
  // Fourth place: on the board but off the podium, so the chip has to come from
  // the table row rather than a podium tile.
  const viewer = await seedRankedUser(TOP - 3, 5);

  await openLeaderboards(page, viewer);

  const viewerRow = page.locator(`[data-userslug="${viewer.userslug}"]`);
  await expect(viewerRow).toHaveCount(1);
  await expect(viewerRow).toHaveAttribute('data-rank', '4');
  await expect(viewerRow.getByTestId('you-chip')).toBeVisible();
  await expect(viewerRow).toContainText(viewer.username);

  // Exactly one row is marked as the viewer.
  await expect(page.getByTestId('you-chip')).toHaveCount(1);
});
