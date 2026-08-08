import { test, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import {
  serviceDb,
  createTestUser,
  createPublishedPost,
  deleteTestUser,
  signIn,
  dismissOverlays,
  addGroupMember,
  slugify,
} from './helpers';

// Track 3D: rail post counts + circles directory grid.
//
// Stat VALUES are deliberately not asserted exactly: post counts come from the
// shared `groups-list-stats` cache (300 s), so a circle seeded after the server
// warmed that entry legitimately reads 0 until it revalidates. Exact aggregate
// correctness is covered by e2e/groups-list-stats.vitest.ts; this spec asserts
// the trio RENDERS and that the action states are right.
const STAT_TRIO = /\d[\d,]* members · \d[\d,]* posts\/mo · (\d+% solved|—)/;

const db = serviceDb();

async function createPublicGroup(
  createdBy: string,
  prefix: string
): Promise<{ id: string; slug: string; name: string }> {
  const slug = slugify(prefix);
  const [group] = await db
    .insert(schema.groups)
    .values({
      slug,
      name: `Dir ${slug}`,
      description: 'Directory grid fixture circle',
      visibility: 'public',
      color: '#000000',
      createdBy,
    })
    .returning();
  if (!group) throw new Error('Failed to create public group');
  return { id: group.id, slug: group.slug, name: group.name };
}

test('rail shows post counts and the circles directory renders stats + join states', async ({
  page,
}) => {
  const owner = await createTestUser({ role: 'admin', onboardingComplete: true });
  const viewer = await createTestUser({ onboardingComplete: true });
  const groupIds: string[] = [];

  try {
    // 1. Public circle the viewer has NOT joined, with a published post so the
    //    stats aggregate has something to count → "Join".
    const joinable = await createPublicGroup(owner.id, 'dir-joinable');
    groupIds.push(joinable.id);
    await createPublishedPost(joinable.id, owner.id, `Directory fixture ${Date.now()}`);

    // 2. Public circle the viewer IS a member of → "✓ Joined".
    const joined = await createPublicGroup(owner.id, 'dir-joined');
    groupIds.push(joined.id);
    await addGroupMember(joined.id, viewer.id, 'member');

    // 3. Invite-only circle the viewer can see (they created it) but has no
    //    membership row for → "Request invite". Inserted directly because
    //    createInviteOnlyGroup also adds the creator as an admin member.
    const inviteSlug = slugify('dir-invite');
    const [inviteOnly] = await db
      .insert(schema.groups)
      .values({
        slug: inviteSlug,
        name: `Dir ${inviteSlug}`,
        description: 'Invite-only fixture circle',
        visibility: 'invite_only',
        color: '#000000',
        createdBy: viewer.id,
      })
      .returning();
    if (!inviteOnly) throw new Error('Failed to create invite-only group');
    groupIds.push(inviteOnly.id);

    await signIn(page, viewer.email, viewer.password);
    await page.goto('/feed');
    await dismissOverlays(page);

    // Rail: every circle row carries a post count next to the dot / joined ✓.
    const rail = page.getByTestId('left-rail');
    await expect(rail).toBeVisible();
    await expect(rail.getByTestId(`rail-circle-count-${joinable.slug}`)).toHaveText(/^\d[\d,]*$/);
    await expect(rail.getByTestId(`rail-circle-count-${joined.slug}`)).toHaveText(/^\d[\d,]*$/);

    // Directory grid, reached through the rail's "All circles" link.
    await rail.getByRole('link', { name: 'All circles' }).click();
    await page.waitForURL('/g');

    // Stat trio: members · posts/mo · solved rate (— when no questions yet).
    await expect(page.getByTestId(`circle-card-stats-${joinable.slug}`)).toHaveText(STAT_TRIO);
    await expect(page.getByTestId(`circle-card-stats-${joined.slug}`)).toHaveText(STAT_TRIO);

    // Action states.
    await expect(page.getByTestId(`circle-joined-${joined.slug}`)).toBeVisible();
    await expect(page.getByTestId(`circle-request-invite-${inviteOnly.slug}`)).toBeVisible();

    const joinButton = page.getByTestId(`circle-join-${joinable.slug}`);
    await expect(joinButton).toBeVisible();
    await joinButton.click();
    await expect(page.getByTestId(`circle-joined-${joinable.slug}`)).toBeVisible();
  } finally {
    for (const groupId of groupIds) {
      await db.delete(schema.groups).where(eq(schema.groups.id, groupId)).catch(() => {});
    }
    await deleteTestUser(viewer.id).catch(() => {});
    await deleteTestUser(owner.id).catch(() => {});
  }
});
