import { test, expect, type Page } from '@playwright/test';
import {
  addGroupMember,
  createNotification,
  createPublicGroup,
  createTestUser,
  deleteGroup,
  deleteTestUser,
  dismissOverlays,
  signIn,
} from './helpers';

// Phase 5 track 5D: restyled Notifications + Settings.
//
// Locator policy (two failures earlier in this phase informed this):
//   1. Role-based locators only, with unanchored name matching — anchored
//      toHaveText regexes collide with sr-only text in the shell.
//   2. Never assert immediately after a client action that races a refetch.
//      Settings reloads the page on leave, and the save round-trips, so we wait
//      on an explicit state signal (aria-checked, role=status, or a control
//      disappearing) or reload first.
//   3. Everything is scoped to the <main> landmark. The shell's LeftRail also
//      renders <li> nav rows, circle links by name, and a "Weekly digest" item,
//      so unscoped listitem/link locators would double-match. The Radix
//      ConfirmDialog portals to <body>, so its locator stays on `page`.

const usersToClean: string[] = [];
const groupsToClean: string[] = [];

test.afterEach(async () => {
  // Groups before users: groups.created_by references users.
  for (const groupId of groupsToClean) {
    await deleteGroup(groupId).catch(() => {});
  }
  groupsToClean.length = 0;
  // notifications.user_id and group_memberships cascade with the user.
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

async function signInAsMember(page: Page) {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);
  await signIn(page, user.email, user.password);
  return user;
}

/** The page's own content region, excluding the shell's header and left rail. */
function main(page: Page) {
  return page.getByRole('main');
}

test.describe('Notifications page', () => {
  test('renders the seeded notifications and marks one as read', async ({ page }) => {
    const user = await createTestUser({ onboardingComplete: true });
    usersToClean.push(user.id);

    await createNotification({
      userId: user.id,
      type: 'mention',
      payload: { actorUsername: 'testactor' },
    });
    await createNotification({
      userId: user.id,
      type: 'solution',
      payload: { actorUsername: 'testactor' },
    });
    await createNotification({
      userId: user.id,
      type: 'badge',
      payload: { badgeName: 'First Answer' },
      readAt: new Date(),
    });

    await signIn(page, user.email, user.password);
    await page.goto('/notifications');
    await dismissOverlays(page);

    await expect(main(page).getByRole('heading', { name: 'Notifications' })).toBeVisible();

    // Three rows total, two of them unread.
    await expect(main(page).getByRole('listitem')).toHaveCount(3);

    const markReadButtons = main(page).getByRole('button', {
      name: 'Mark this notification as read',
    });
    await expect(markReadButtons).toHaveCount(2);

    // Mark one read; the button count dropping is the explicit state signal
    // that the PATCH resolved, so we never assert into an in-flight request.
    await markReadButtons.first().click();
    await expect(markReadButtons).toHaveCount(1);

    // Reload to prove the read state persisted server-side rather than only in
    // local component state.
    await page.reload();
    await dismissOverlays(page);
    await expect(main(page).getByRole('listitem')).toHaveCount(3);
    await expect(
      main(page).getByRole('button', { name: 'Mark this notification as read' })
    ).toHaveCount(1);
  });

  test('mark all read clears every unread row', async ({ page }) => {
    const user = await createTestUser({ onboardingComplete: true });
    usersToClean.push(user.id);

    await createNotification({ userId: user.id, type: 'comment', payload: {} });
    await createNotification({ userId: user.id, type: 'new_follower', payload: {} });

    await signIn(page, user.email, user.password);
    await page.goto('/notifications');
    await dismissOverlays(page);

    const markAll = main(page).getByRole('button', { name: 'Mark all read' });
    await expect(markAll).toBeVisible();
    await markAll.click();

    // The button only renders while unreadCount > 0 — its disappearance is the
    // state signal for the bulk PATCH completing.
    await expect(markAll).toHaveCount(0);

    await page.reload();
    await dismissOverlays(page);
    await expect(main(page).getByRole('listitem')).toHaveCount(2);
    await expect(main(page).getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
  });

  test('shows the empty state when there are no notifications', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/notifications');
    await dismissOverlays(page);

    await expect(main(page).getByText('No notifications yet')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
  });
});

test.describe('Settings — email notification switches', () => {
  test('renders five switches and the stored-but-not-sending caveat', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/settings');
    await dismissOverlays(page);

    await expect(main(page).getByRole('switch')).toHaveCount(5);

    for (const name of [
      'Replies to my posts',
      'Solution accepted',
      'Mentions',
      'Weekly digest',
      'New followers',
    ]) {
      await expect(main(page).getByRole('switch', { name })).toBeVisible();
    }

    // The honest note: only the digest actually sends mail today.
    await expect(
      main(page).getByText('Only the weekly digest sends email today')
    ).toBeVisible();
    // The stored-only switches each carry an inline caveat badge. weeklyDigest
    // and emailSolutions both drive real sends now, so three remain.
    await expect(main(page).getByText('not sending yet')).toHaveCount(3);
  });

  test('toggles persist across a reload', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/settings');
    await dismissOverlays(page);

    const digest = main(page).getByRole('switch', { name: 'Weekly digest' });
    const mentions = main(page).getByRole('switch', { name: 'Mentions' });

    // A fresh user (preferences = {}) sees each switch in the state the backend
    // actually behaves as: the digest cron needs an explicit 'true' so it starts
    // off, while the transactional switches suppress only on an explicit false,
    // so they start on. Toggle each AWAY from its default.
    await expect(digest).toHaveAttribute('aria-checked', 'false');
    await expect(mentions).toHaveAttribute('aria-checked', 'true');

    await digest.click();
    await mentions.click();
    await expect(digest).toHaveAttribute('aria-checked', 'true');
    await expect(mentions).toHaveAttribute('aria-checked', 'false');

    await main(page).getByRole('button', { name: 'Save changes' }).click();
    // role=status "Saved ✓" only renders after the PATCH resolves — wait on it
    // rather than reloading into an in-flight write.
    await expect(main(page).getByRole('status')).toBeVisible();

    await page.reload();
    await dismissOverlays(page);

    await expect(main(page).getByRole('switch', { name: 'Weekly digest' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(main(page).getByRole('switch', { name: 'Mentions' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    // An untouched transactional switch keeps its opt-out default.
    await expect(main(page).getByRole('switch', { name: 'New followers' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('turning a switch back off persists too', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/settings');
    await dismissOverlays(page);

    const digest = main(page).getByRole('switch', { name: 'Weekly digest' });
    await digest.click();
    await expect(digest).toHaveAttribute('aria-checked', 'true');
    await main(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(main(page).getByRole('status')).toBeVisible();

    await page.reload();
    await dismissOverlays(page);

    const digestAgain = main(page).getByRole('switch', { name: 'Weekly digest' });
    await expect(digestAgain).toHaveAttribute('aria-checked', 'true');
    await digestAgain.click();
    await expect(digestAgain).toHaveAttribute('aria-checked', 'false');
    await main(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(main(page).getByRole('status')).toBeVisible();

    await page.reload();
    await dismissOverlays(page);
    await expect(main(page).getByRole('switch', { name: 'Weekly digest' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});

test.describe('Settings — my circles', () => {
  test('leaving a circle removes it from the list', async ({ page }) => {
    const owner = await createTestUser({ onboardingComplete: true });
    usersToClean.push(owner.id);
    const member = await createTestUser({ onboardingComplete: true });
    usersToClean.push(member.id);

    // Two circles so we can prove only the left one disappears. The owner stays
    // admin of both, so the member is never the last admin (that 409s).
    const stays = await createPublicGroup(owner.id);
    groupsToClean.push(stays.id);
    const leaves = await createPublicGroup(owner.id);
    groupsToClean.push(leaves.id);

    await addGroupMember(stays.id, member.id, 'member');
    await addGroupMember(leaves.id, member.id, 'member');

    await signIn(page, member.email, member.password);
    await page.goto('/settings');
    await dismissOverlays(page);

    await expect(main(page).getByRole('link', { name: stays.name })).toBeVisible();
    await expect(main(page).getByRole('link', { name: leaves.name })).toBeVisible();

    await main(page).getByRole('button', { name: `Leave ${leaves.name}` }).click();

    // The ConfirmDialog portals to <body>, so it is located on `page`, not main.
    await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

    // leaveGroup() triggers window.location.reload(); wait for the row to be
    // gone rather than asserting straight after the click.
    await expect(
      main(page).getByRole('button', { name: `Leave ${leaves.name}` })
    ).toHaveCount(0);
    await expect(main(page).getByRole('link', { name: leaves.name })).toHaveCount(0);
    await expect(main(page).getByRole('link', { name: stays.name })).toBeVisible();
  });

  test('shows the empty state when the user has no circles', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/settings');
    await dismissOverlays(page);

    await expect(main(page).getByText('You haven’t joined any circles yet.')).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Browse circles' })).toBeVisible();
  });
});
