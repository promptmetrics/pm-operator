import { test, expect, type Browser } from '@playwright/test';
import { eq, and } from 'drizzle-orm';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  serviceDb,
  createInviteOnlyGroup,
  createPublishedPost,
  createHiddenPost,
  createGroupInvite,
  addGroupMember,
  countPointEvents,
} from './helpers';
import { pointEvents } from '@pm-operator/db';

const usersToClean: string[] = [];

test.afterEach(async () => {
  for (const userId of usersToClean) {
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('anonymous users can read the public feed', async ({ page }) => {
  const res = await page.request.get('/api/v1/feed');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.posts.length).toBeGreaterThan(0);
});

test('anonymous users are blocked from invite-only circles', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);

  const { id: groupId, slug } = await createInviteOnlyGroup(admin.id);
  await createPublishedPost(groupId, admin.id);

  const groupRes = await page.request.get(`/api/v1/groups/${slug}`);
  expect(groupRes.status()).toBe(404);

  const feedRes = await page.request.get(`/api/v1/feed?groupSlug=${slug}`);
  expect(feedRes.status()).toBe(200);
  const body = await feedRes.json();
  expect(body.data.posts.length).toBe(0);
});

test('hidden posts show a placeholder to non-privileged users', async ({ page, browser }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  const member = await createTestUser({ onboardingComplete: true });
  usersToClean.push(admin.id, member.id);

  const { id: groupId, slug } = await createInviteOnlyGroup(admin.id);
  await addGroupMember(groupId, member.id, 'member');
  const hiddenPostId = await createHiddenPost(groupId, admin.id);

  // Anonymous is blocked entirely.
  const anonRes = await page.request.get(`/api/v1/posts/${hiddenPostId}`);
  expect(anonRes.status()).toBe(404);

  // Non-admin member cannot see the post.
  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await signIn(memberPage, member.email, member.password);
  const memberRes = await memberPage.request.get(`/api/v1/posts/${hiddenPostId}`);
  expect(memberRes.status()).toBe(404);
  await memberCtx.close();

  // Admin can see the hidden content.
  await signIn(page, admin.email, admin.password);
  const adminRes = await page.request.get(`/api/v1/posts/${hiddenPostId}`);
  expect(adminRes.status()).toBe(200);
  const body = await adminRes.json();
  expect(body.data.content).toContain('Hidden content');
});

test('members can access invite-only circles via invite code', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  const member = await createTestUser({ onboardingComplete: true });
  usersToClean.push(admin.id, member.id);

  const { id: groupId, slug } = await createInviteOnlyGroup(admin.id);
  const postId = await createPublishedPost(groupId, admin.id);
  const code = await createGroupInvite(groupId, admin.id, 'member');

  await signIn(page, member.email, member.password);

  const joinRes = await page.request.post(`/api/v1/groups/${slug}/membership`, {
    data: { inviteCode: code },
  });
  expect(joinRes.status()).toBe(200);

  const groupRes = await page.request.get(`/api/v1/groups/${slug}`);
  expect(groupRes.status()).toBe(200);

  const feedRes = await page.request.get(`/api/v1/feed?groupSlug=${slug}`);
  expect(feedRes.status()).toBe(200);
  const body = await feedRes.json();
  expect(body.data.posts.map((p: { id: string }) => p.id)).toContain(postId);
});

test('removing the last admin from a group is blocked', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  const backup = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id, backup.id);

  const { id: groupId, slug } = await createInviteOnlyGroup(admin.id);

  await signIn(page, admin.email, admin.password);

  // Self-leave as the only admin must fail.
  const selfRes = await page.request.delete(`/api/v1/groups/${slug}/membership`);
  expect(selfRes.status()).toBe(409);
  const selfBody = await selfRes.json();
  expect(selfBody.error.message).toContain('last admin');

  // Adding a second admin lets the original admin leave.
  await addGroupMember(groupId, backup.id, 'admin');
  const leaveRes = await page.request.delete(`/api/v1/groups/${slug}/membership`);
  expect(leaveRes.status()).toBe(200);
});

test('daily_visit point event is idempotent per day', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  await signIn(page, user.email, user.password);

  const first = await page.request.post('/api/v1/daily-visit');
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data.awarded).toBe(true);

  const second = await page.request.post('/api/v1/daily-visit');
  expect(second.status()).toBe(200);
  const secondBody = await second.json();
  expect(secondBody.data.awarded).toBe(false);
});

test('posts_read points cap at 20 reads and 10 points per day', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  const reader = await createTestUser({ onboardingComplete: true });
  usersToClean.push(admin.id, reader.id);

  const { id: groupId } = await createInviteOnlyGroup(admin.id);
  await addGroupMember(groupId, reader.id, 'member');
  const postId = await createPublishedPost(groupId, admin.id);

  await signIn(page, reader.email, reader.password);

  for (let i = 0; i < 25; i += 1) {
    const res = await page.request.get(`/api/v1/posts/${postId}`);
    expect(res.status()).toBe(200);
  }

  const eventCount = await countPointEvents(reader.id, 'posts_read');
  expect(eventCount).toBeLessThanOrEqual(20);

  const db = serviceDb();
  const rows = await db
    .select({ points: pointEvents.points })
    .from(pointEvents)
    .where(and(eq(pointEvents.userId, reader.id), eq(pointEvents.eventType, 'posts_read')));
  const totalPoints = rows.reduce((sum, r) => sum + Number(r.points), 0);
  expect(totalPoints).toBeLessThanOrEqual(10);
});

test('toggling a reaction does not create duplicate like_given point events', async ({ page }) => {
  const author = await createTestUser({ onboardingComplete: true });
  const liker = await createTestUser({ onboardingComplete: true });
  usersToClean.push(author.id, liker.id);

  const { id: groupId } = await createInviteOnlyGroup(author.id);
  await addGroupMember(groupId, liker.id, 'member');
  const postId = await createPublishedPost(groupId, author.id);

  await signIn(page, liker.email, liker.password);

  const react = () =>
    page.request.post('/api/v1/reactions', {
      data: { targetType: 'post', targetId: postId, reactionType: 'like' },
    });

  const first = await react();
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data.id).toBeDefined();

  // Toggle off.
  const second = await react();
  expect(second.status()).toBe(200);

  // Toggle on again.
  const third = await react();
  expect(third.status()).toBe(200);

  const likeGivenCount = await countPointEvents(liker.id, 'like_given');
  expect(likeGivenCount).toBe(1);
});
