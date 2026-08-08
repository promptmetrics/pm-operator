import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, signIn, dismissOverlays } from './helpers';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

// The pane split is a CSS-only `md` breakpoint (768px), so these viewports sit
// clearly on either side of it.
const DESKTOP = { width: 1280, height: 900 };
const NARROW = { width: 480, height: 900 };

async function startConversation(
  page: Page,
  targetUserId: string,
  body: string
): Promise<string> {
  const convRes = await page.request.post('/api/v1/conversations', {
    data: { targetUserId },
  });
  expect(convRes.status()).toBe(201);
  const conversationId = (await convRes.json()).data.id as string;
  expect(conversationId).toBeTruthy();

  const msgRes = await page.request.post(`/api/v1/conversations/${conversationId}/messages`, {
    data: { body },
  });
  expect(msgRes.status()).toBe(201);

  return conversationId;
}

test('desktop /messages shows the inbox and the selected thread together', async ({ page }) => {
  const viewer = await createTestUser({ onboardingComplete: true });
  const partnerA = await createTestUser({ onboardingComplete: true });
  const partnerB = await createTestUser({ onboardingComplete: true });
  usersToClean.push(viewer.id, partnerA.id, partnerB.id);

  await signIn(page, viewer.email, viewer.password);

  const bodyA = `Two-pane hello A ${Date.now()}`;
  const bodyB = `Two-pane hello B ${Date.now()}`;
  await startConversation(page, partnerA.id, bodyA);
  await startConversation(page, partnerB.id, bodyB);

  await page.setViewportSize(DESKTOP);
  await page.goto('/messages');
  await dismissOverlays(page);

  const inbox = page.getByTestId('messages-inbox');
  const threadPane = page.getByTestId('messages-thread-pane');

  // Nothing selected yet: inbox on the left, placeholder on the right.
  await expect(inbox).toBeVisible();
  await expect(threadPane).toContainText('No conversation selected');

  await inbox.getByRole('link', { name: partnerA.username }).click();

  // Both panes on screen at once, and the thread swapped in place — the URL
  // never changes, so no RSC navigation ran.
  await expect(threadPane.getByText(bodyA)).toBeVisible();
  await expect(inbox).toBeVisible();
  await expect(page).toHaveURL(/\/messages$/);

  // Picking another conversation replaces the thread pane, not the page.
  await inbox.getByRole('link', { name: partnerB.username }).click();
  await expect(threadPane.getByText(bodyB)).toBeVisible();
  await expect(threadPane.getByText(bodyA)).toHaveCount(0);
  await expect(inbox).toBeVisible();
  await expect(page).toHaveURL(/\/messages$/);

  // Above the breakpoint there is nothing to go back to — the inbox is right there.
  await expect(threadPane.getByRole('button', { name: 'Back to messages' })).toBeHidden();
});

test('narrow /messages is single-pane with a working back button', async ({ page }) => {
  const viewer = await createTestUser({ onboardingComplete: true });
  const partner = await createTestUser({ onboardingComplete: true });
  usersToClean.push(viewer.id, partner.id);

  await signIn(page, viewer.email, viewer.password);

  const body = `Single-pane hello ${Date.now()}`;
  await startConversation(page, partner.id, body);

  await page.setViewportSize(NARROW);
  await page.goto('/messages');
  await dismissOverlays(page);

  const inbox = page.getByTestId('messages-inbox');
  const threadPane = page.getByTestId('messages-thread-pane');

  // Only the inbox is on screen below the breakpoint.
  await expect(inbox).toBeVisible();
  await expect(threadPane).toBeHidden();

  await inbox.getByRole('link', { name: partner.username }).click();

  // Opening a conversation replaces the inbox with the thread.
  await expect(threadPane.getByText(body)).toBeVisible();
  await expect(inbox).toBeHidden();

  const back = threadPane.getByRole('button', { name: 'Back to messages' });
  await expect(back).toBeVisible();
  await back.click();

  await expect(inbox).toBeVisible();
  await expect(threadPane).toBeHidden();
  await expect(page).toHaveURL(/\/messages$/);
});

test('/messages/[id] still deep-links straight to a conversation', async ({ page }) => {
  const viewer = await createTestUser({ onboardingComplete: true });
  const partner = await createTestUser({ onboardingComplete: true });
  usersToClean.push(viewer.id, partner.id);

  await signIn(page, viewer.email, viewer.password);

  const body = `Deep link hello ${Date.now()}`;
  const conversationId = await startConversation(page, partner.id, body);

  await page.setViewportSize(NARROW);
  await page.goto(`/messages/${conversationId}`);
  await dismissOverlays(page);

  // The standalone route renders the thread on its own, with its own link back
  // to the inbox (the two-pane variant uses a button instead).
  await expect(page.getByTestId('message-thread')).toContainText(body);
  const back = page.getByRole('link', { name: 'Back to messages' });
  await expect(back).toBeVisible();

  await back.click();
  await page.waitForURL('/messages');
  await expect(page.getByTestId('messages-inbox')).toBeVisible();
});
