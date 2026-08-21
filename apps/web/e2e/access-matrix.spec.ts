import { test, expect, type Browser } from '@playwright/test';
import { eq, and } from 'drizzle-orm';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  serviceDb,
  createInviteOnlyGroup,
  createPublicGroup,
  createPublishedPost,
  createHiddenPost,
  createGroupInvite,
  addGroupMember,
  countPointEvents,
} from './helpers';
import { pointEvents, posts } from '@pm-operator/db';

/** The slug a post is reachable at — createPublishedPost only returns the id. */
async function postSlugOf(postId: string): Promise<string> {
  const row = await serviceDb().query.posts.findFirst({
    where: eq(posts.id, postId),
    columns: { slug: true },
  });
  if (!row) throw new Error(`No post ${postId}`);
  return row.slug;
}

async function setPostStatus(postId: string, status: 'draft' | 'flagged' | 'hidden') {
  await serviceDb().update(posts).set({ status }).where(eq(posts.id, postId));
}

const MODERATED_PLACEHOLDER = 'Removed by moderator';

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

// T5G (decision D-B): the DevCard page and its PNG are the ONLY public paths
// under /u/. The three tests below work as a set — the first two prove the
// carve-out actually opens those paths, the third proves it did not widen into
// a prefix that opens the whole profile space. A change to the middleware
// allowlist must keep all three green; passing only the first two means the
// gate leaked.

test('signed-out visitors can open a DevCard page', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  const path = `/u/${user.userslug}/devcard`;

  // No redirect to /login, and the card actually renders.
  const res = await page.goto(path);
  expect(res?.status()).toBe(200);
  expect(page.url()).toContain(path);
  await expect(page.getByRole('heading', { level: 1, name: user.username })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PNG' })).toBeVisible();
});

test('the DevCard PNG is public and served as image/png', async ({ page }) => {
  const user = await createTestUser({ onboardingComplete: true });
  usersToClean.push(user.id);

  // page.request carries this context's cookies — none here, so unauthenticated.
  const res = await page.request.get(`/api/og/devcard/${user.userslug}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');

  const body = await res.body();
  expect(body.length).toBeGreaterThan(0);
  // PNG magic number: \x89 P N G.
  expect(body.subarray(0, 4).toString('latin1')).toBe('\x89PNG');

  // An unknown slug is a 404, not a 500 from a crashed render.
  const missing = await page.request.get(`/api/og/devcard/${user.userslug}-does-not-exist`);
  expect(missing.status()).toBe(404);
});

// The favicon has to reach signed-out visitors — they are most of who ever sees
// a tab. It stays public only because middleware's matcher excludes any path
// containing a dot; a generated `icon.tsx` would serve at `/icon` (no dot) and
// get redirected to /login, which in a browser looks exactly like "no favicon".
test('the app icon is public and served as SVG', async ({ page }) => {
  const res = await page.request.get('/icon.svg');
  expect(res.status()).toBe(200);
  expect(res.url(), 'the icon must not redirect a signed-out visitor to login').not.toContain(
    '/login'
  );
  expect(res.headers()['content-type']).toContain('image/svg+xml');

  // The solid cut is what survives at 16px, so assert the knockout is intact
  // rather than just that some bytes came back.
  const body = await res.text();
  expect(body).toContain('fill-rule="evenodd"');
});

// NOTE ON SCOPE: profile pages are NOT behind the middleware gate, and were
// not before the DevCard work. COMMUNITY_ROUTE_REGEX's `u\/` branch consumes
// the slash and then requires another one, so it only ever matched the bare
// `/u/` — same for `/g/` and `/p/`, which are deliberately public (an
// anonymous visitor can read a public circle and post; see prod-smoke). So
// this test asserts what the DevCard allowlist is actually responsible for:
// it must not widen access to anything that IS gated today.
test('the devcard allowlist does not widen access to gated routes', async ({ page }) => {
  const gated = ['/settings', '/messages', '/bookmarks', '/notifications', '/moderation'];

  for (const path of gated) {
    // Redirects are followed, so the FINAL url is the assertion: a gated path
    // lands on /login. (maxRedirects: 0 would throw rather than hand back a 307.)
    const res = await page.request.get(path);
    expect(res.url(), `${path} should redirect a signed-out visitor to login`).toContain('/login');
  }

  // The PNG namespace resolves only in its exact one-segment form.
  const gatedPng = await page.request.get('/api/og/devcard');
  expect(gatedPng.status()).toBe(404);
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

  // The Header fires its own fire-and-forget daily-visit POST after sign-in,
  // and the editor code-split sped hydration up enough for it to beat the
  // manual request below (CI 2026-08-21). Whether this POST is the first or
  // second award attempt of the day is therefore a race — so the assertions
  // pin the invariant itself: repeat requests never double-award.
  const first = await page.request.post('/api/v1/daily-visit');
  expect(first.status()).toBe(200);

  const second = await page.request.post('/api/v1/daily-visit');
  expect(second.status()).toBe(200);
  const secondBody = await second.json();
  expect(secondBody.data.awarded).toBe(false);

  // The real idempotence pin: exactly one daily_visit event, no matter how
  // many requests (automatic + manual) landed today.
  const events = await serviceDb()
    .select()
    .from(pointEvents)
    .where(and(eq(pointEvents.userId, user.id), eq(pointEvents.eventType, 'daily_visit')));
  expect(events.length).toBe(1);
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

// --- Public post reads, and what must NOT be publicly readable ---
//
// These tests work as a set, the same way the DevCard triad above does. The
// first proves post pages are open to anonymous visitors — that is deliberate
// product behavior (non-members read; they sign in to engage), and it survives
// only because COMMUNITY_ROUTE_REGEX's trailing `(\/|$)` stops `/g/a/b` from
// matching. Nothing asserted it until now, so a tidy-up of that regex would
// have silently broken every shared link with CI still green.
//
// The rest prove the gate being open does not mean the door is off its hinges:
// once middleware is out of the picture, postVisibilityFilter is the only thing
// deciding what an anonymous caller sees.

test('anonymous visitors can read a post in a public circle', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const group = await createPublicGroup(author.id);
  const postId = await createPublishedPost(group.id, author.id, 'Publicly readable post');
  const slug = await postSlugOf(postId);

  const res = await page.goto(`/g/${group.slug}/${slug}`);
  expect(res?.status(), 'a public post must not redirect or error for a signed-out visitor').toBe(200);
  expect(page.url(), 'must not bounce to /login').not.toContain('/login');
  await expect(page.getByRole('heading', { name: 'Publicly readable post' })).toBeVisible();
});

test('a post declined by moderation is not readable by anonymous visitors', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const group = await createPublicGroup(author.id);
  const postId = await createPublishedPost(group.id, author.id, 'Declined by a moderator');
  const slug = await postSlugOf(postId);

  // Declining in /admin/moderation/approval sets status to 'draft'. The queue
  // empties either way, so if this leaks the moderator gets no signal at all.
  await setPostStatus(postId, 'draft');

  await page.goto(`/g/${group.slug}/${slug}`);
  await expect(page.getByRole('heading', { name: MODERATED_PLACEHOLDER })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Declined by a moderator' })).toHaveCount(0);
});

test('a flagged post is not readable by anonymous visitors', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const group = await createPublicGroup(author.id);
  const postId = await createPublishedPost(group.id, author.id, 'Flagged for review');
  const slug = await postSlugOf(postId);
  await setPostStatus(postId, 'flagged');

  await page.goto(`/g/${group.slug}/${slug}`);
  await expect(page.getByRole('heading', { name: MODERATED_PLACEHOLDER })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Flagged for review' })).toHaveCount(0);
});

// Redaction used to test the POST AUTHOR's role rather than the viewer's, so a
// hidden post written by an admin rendered in full to whoever could fetch it.
test('a hidden post written by an admin is not readable by anonymous visitors', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const group = await createPublicGroup(author.id);
  const postId = await createPublishedPost(group.id, author.id, 'Hidden admin authored post');
  const slug = await postSlugOf(postId);
  await setPostStatus(postId, 'hidden');

  await page.goto(`/g/${group.slug}/${slug}`);
  await expect(page.getByRole('heading', { name: MODERATED_PLACEHOLDER })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hidden admin authored post' })).toHaveCount(0);
});

test('anonymous visitors cannot read a post in an invite-only circle', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const { id: groupId, slug: groupSlug } = await createInviteOnlyGroup(author.id);
  const postId = await createPublishedPost(groupId, author.id, 'Members only material');
  const slug = await postSlugOf(postId);

  await page.goto(`/g/${groupSlug}/${slug}`);
  await expect(page.getByRole('heading', { name: MODERATED_PLACEHOLDER })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Members only material' })).toHaveCount(0);
});

test('a declined post stays out of anonymous search and feed results', async ({ page }) => {
  const author = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(author.id);

  const group = await createPublicGroup(author.id);
  const postId = await createPublishedPost(group.id, author.id, 'Zebracorn declined artifact');
  await setPostStatus(postId, 'draft');

  // search.ts and community.ts each kept a private copy of the visibility
  // filter; this asserts they now share the corrected one.
  const searchRes = await page.request.get('/api/v1/search?q=Zebracorn');
  expect(searchRes.status()).toBe(200);
  const searchBody = await searchRes.json();
  expect(searchBody.data.results.map((r: { id: string }) => r.id)).not.toContain(postId);

  const feedRes = await page.request.get(`/api/v1/feed?groupSlug=${group.slug}`);
  expect(feedRes.status()).toBe(200);
  const feedBody = await feedRes.json();
  expect(feedBody.data.posts.map((p: { id: string }) => p.id)).not.toContain(postId);
});
