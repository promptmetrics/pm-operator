import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createDrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { eq, and, count } from 'drizzle-orm';
import type { Page } from '@playwright/test';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL'
  );
}

export const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

let _serviceDb: ReturnType<typeof createDrizzleClient>['db'] | null = null;

export function serviceDb() {
  if (!_serviceDb) {
    _serviceDb = createDrizzleClient({ databaseUrl: databaseUrl! }).db;
  }
  return _serviceDb;
}

export function uniqueEmail(prefix = 'test') {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function slugify(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  username: string;
  userslug: string;
}

export async function createTestUser(opts: {
  role?: 'member' | 'moderator' | 'admin';
  onboardingComplete?: boolean;
} = {}): Promise<TestUser> {
  const role = opts.role ?? 'member';
  const email = uniqueEmail(role);
  const password = 'Password123!';
  const username = `Test ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
  const userslug = slugify('test');

  const { data, error } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Failed to create test user');

  const db = serviceDb();
  await db.insert(schema.users).values({
    id: data.user.id,
    email,
    username,
    userslug,
    fullName: username,
    pictureUrl: null,
    aboutMe: null,
    emailConfirmed: true,
    role,
    painfulToolStackTask: opts.onboardingComplete
      ? 'End-to-end test onboarding task'
      : '',
    preferences: {},
  });

  return { id: data.user.id, email, password, username, userslug };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const db = serviceDb();
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await serviceSupabase.auth.admin.deleteUser(userId);
}

function cookieDomainFromBaseUrl(): string {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  return new URL(base).hostname;
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  // Sign in via the admin-backed client and inject the session cookies to avoid
  // Supabase Auth IP rate limits in repeated test runs.
  const { data, error } = await serviceSupabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw error ?? new Error('Failed to sign in test user');
  }

  const hostname = new URL(supabaseUrl!).hostname.split('.')[0];
  const cookieName = `sb-${hostname}-auth-token`;

  await page.context().addCookies([
    {
      name: cookieName,
      value: JSON.stringify(data.session),
      domain: cookieDomainFromBaseUrl(),
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);

  // Navigate to a protected route so the app redirects based on onboarding state.
  await page.goto('/settings');
}

export async function completeOnboarding(page: Page, returnUrl = '/feed'): Promise<void> {
  await page.waitForURL(`/register/complete?returnUrl=${encodeURIComponent(returnUrl)}`);
  await page.locator('#painful-tool-stack-task').fill('End-to-end test onboarding task');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(returnUrl);
}

export async function createInviteOnlyGroup(
  adminUserId: string,
  slug?: string,
  name?: string
): Promise<{ id: string; slug: string }> {
  const db = serviceDb();
  const groupSlug = slug ?? slugify('invite-only');
  const groupName = name ?? `Invite-only ${groupSlug}`;

  const [group] = await db
    .insert(schema.groups)
    .values({
      slug: groupSlug,
      name: groupName,
      visibility: 'invite_only',
      color: '#000000',
      createdBy: adminUserId,
    })
    .returning();

  if (!group) throw new Error('Failed to create group');

  await db.insert(schema.groupMemberships).values({
    groupId: group.id,
    userId: adminUserId,
    role: 'admin',
  });

  return { id: group.id, slug: group.slug };
}

export async function createPublishedPost(
  groupId: string,
  authorId: string,
  title?: string
): Promise<string> {
  const db = serviceDb();
  const [post] = await db
    .insert(schema.posts)
    .values({
      groupId,
      authorId,
      title: title ?? `Test post ${Date.now()}`,
      content: '<p>Test content</p>',
      contentPlain: 'Test content',
      type: 'discussion',
      status: 'published',
      tags: [],
    })
    .returning();
  if (!post) throw new Error('Failed to create published post');
  return post.id;
}

export async function createHiddenPost(groupId: string, authorId: string): Promise<string> {
  const db = serviceDb();
  const [post] = await db
    .insert(schema.posts)
    .values({
      groupId,
      authorId,
      title: 'Hidden post placeholder test',
      content: '<p>Hidden content</p>',
      contentPlain: 'Hidden content',
      type: 'discussion',
      status: 'hidden',
      tags: [],
    })
    .returning();
  if (!post) throw new Error('Failed to create hidden post');
  return post.id;
}

export async function createGroupInvite(
  groupId: string,
  inviterId: string,
  role: 'member' | 'moderator' | 'admin' = 'member'
): Promise<string> {
  const db = serviceDb();
  const code = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.groupInvites).values({
    groupId,
    inviterId,
    code,
    maxUses: 10,
    role,
  });
  return code;
}

export async function addGroupMember(
  groupId: string,
  userId: string,
  role: 'member' | 'moderator' | 'admin' = 'member'
): Promise<void> {
  const db = serviceDb();
  await db
    .insert(schema.groupMemberships)
    .values({ groupId, userId, role })
    .onConflictDoNothing({
      target: [schema.groupMemberships.groupId, schema.groupMemberships.userId],
    });
}

export async function countPointEvents(
  userId: string,
  eventType?: string
): Promise<number> {
  const db = serviceDb();
  const rows = await db
    .select({ count: count() })
    .from(schema.pointEvents)
    .where(
      eventType
        ? and(eq(schema.pointEvents.userId, userId), eq(schema.pointEvents.eventType, eventType as any))
        : eq(schema.pointEvents.userId, userId)
    );
  return Number(rows[0]?.count ?? 0);
}

export async function getUserReputation(userId: string): Promise<number> {
  const db = serviceDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { reputationScore: true },
  });
  return user ? Number(user.reputationScore) : 0;
}
