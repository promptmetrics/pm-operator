import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createDrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import { eq, and, count, sql } from 'drizzle-orm';
import type { Page } from '@playwright/test';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// TEST_DB_ONLY=1 runs the DB-backed tests against a plain Postgres with no
// Supabase project at all: users get random UUIDs instead of GoTrue accounts.
// It is an explicit flag (not env absence) because .env.local is dotenv-loaded
// above and could silently supply real Supabase credentials.
const dbOnly = process.env.TEST_DB_ONLY === '1';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL?.trim();

if (dbOnly) {
  if (!databaseUrl) throw new Error('Missing DATABASE_URL (TEST_DB_ONLY=1)');
} else if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL'
  );
}

let _serviceSupabase: ReturnType<typeof createClient> | null = null;

function getServiceSupabase() {
  if (dbOnly) {
    throw new Error('TEST_DB_ONLY=1: Supabase auth is unavailable in DB-only mode');
  }
  if (!_serviceSupabase) {
    _serviceSupabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });
  }
  return _serviceSupabase;
}

let _serviceDb: ReturnType<typeof createDrizzleClient>['db'] | null = null;

function missingUrlProxy(): never {
  throw new Error(
    'DATABASE_URL is missing or invalid. Check apps/web/.env.local — it should look like postgresql://postgres:[password]@db.<project-ref>.pooler.supabase.com:5432/postgres'
  );
}

export function serviceDb() {
  if (!_serviceDb) {
    try {
      _serviceDb = createDrizzleClient({ databaseUrl: databaseUrl! }).db;
    } catch {
      return new Proxy(
        {} as ReturnType<typeof createDrizzleClient>['db'],
        { get: () => missingUrlProxy }
      );
    }
  }
  return _serviceDb;
}

export function uniqueEmail(prefix = 'test') {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function postSlugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${base || 'post'}-${id.slice(0, 8)}`;
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
  /**
   * Overrides the generated display name. The palette matches people on a
   * username PREFIX, so seeding a searchable person needs a chosen username.
   */
  username?: string;
} = {}): Promise<TestUser> {
  const role = opts.role ?? 'member';
  const email = uniqueEmail(role);
  const password = 'Password123!';
  const username =
    opts.username ?? `Test ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
  const userslug = slugify('test');

  let userId: string;
  if (dbOnly) {
    // No FK from public.users to auth.users, so a bare UUID is a valid user
    // for everything that doesn't sign in through GoTrue.
    userId = randomUUID();
  } else {
    const { data, error } = await getServiceSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('Failed to create test user');
    userId = data.user.id;
  }

  const db = serviceDb();
  await db.insert(schema.users).values({
    id: userId,
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

  return { id: userId, email, password, username, userslug };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const db = serviceDb();
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  if (!dbOnly) {
    await getServiceSupabase().auth.admin.deleteUser(userId);
  }
}

function cookieDomainFromBaseUrl(): string {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  return new URL(base).hostname;
}

function cookieIsSecure(): boolean {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  return new URL(base).protocol === 'https:';
}

export async function dismissOverlays(page: Page): Promise<void> {
  // Production uses Cloudflare Turnstile / challenge modals and cookie-consent
  // dialogs that intercept pointer events. Remove / dismiss them aggressively
  // before every interaction.
  await page.evaluate(() => {
    const selectors = [
      '.cf_modal_container',
      '.turnstile-wrapper',
      '[class*="cf-"]',
      'iframe[src*="challenges.cloudflare"]',
      'div[data-cf-modals]',
      // Common CMP / cookie-banner containers
      '[data-testid="cookie-banner"]',
      '[aria-label*="cookie"]',
      '[aria-label*="Cookie"]',
      '.cookie-banner',
      '.cookie-settings',
      '#cookie-settings',
    ];
    document.querySelectorAll(selectors.join(', ')).forEach((el) => {
      (el as HTMLElement).style.display = 'none';
      (el as HTMLElement).remove();
    });
    document.querySelectorAll('iframe').forEach((el) => {
      if (el.src.includes('cloudflare') || el.src.includes('turnstile')) {
        el.remove();
      }
    });
    // If a cookie-settings dialog is open, try to accept/close it.
    const acceptBtn =
      Array.from(document.querySelectorAll('button, [role="button"]')).find((el) =>
        /accept all|confirm my choices|save preferences|got it|ok/i.test(el.textContent || '')
      ) ?? null;
    (acceptBtn as HTMLElement | null)?.click();
  });
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  // Sign in via the admin-backed client and inject the session cookies to avoid
  // Supabase Auth IP rate limits in repeated test runs.
  const { data, error } = await getServiceSupabase().auth.signInWithPassword({ email, password });
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
      secure: cookieIsSecure(),
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
  const postTitle = title ?? `Test post ${Date.now()}`;
  const id = randomUUID();
  const [post] = await db
    .insert(schema.posts)
    .values({
      id,
      groupId,
      authorId,
      slug: postSlugify(postTitle, id),
      title: postTitle,
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
  const title = 'Hidden post placeholder test';
  const id = randomUUID();
  const [post] = await db
    .insert(schema.posts)
    .values({
      id,
      groupId,
      authorId,
      slug: postSlugify(title, id),
      title,
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

export async function deleteFlag(flagId: string): Promise<void> {
  const db = serviceDb();
  await db.delete(schema.flags).where(eq(schema.flags.id, flagId));
}

type NotificationInsert = typeof schema.notifications.$inferInsert;

/**
 * Seed a notification row directly. notifications.user_id is ON DELETE CASCADE,
 * so deleteTestUser() cleans these up — no separate teardown needed.
 */
export async function createNotification(opts: {
  userId: string;
  type: NotificationInsert['type'];
  payload?: Record<string, unknown>;
  actorId?: string | null;
  readAt?: Date | null;
}): Promise<string> {
  const db = serviceDb();
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: opts.userId,
      actorId: opts.actorId ?? null,
      type: opts.type,
      payload: opts.payload ?? {},
      readAt: opts.readAt ?? null,
    })
    .returning({ id: schema.notifications.id });
  if (!row) throw new Error('Failed to create notification');
  return row.id;
}

export async function createPublicGroup(
  adminUserId: string,
  slug?: string,
  name?: string
): Promise<{ id: string; slug: string; name: string }> {
  const db = serviceDb();
  const groupSlug = slug ?? slugify('circle');
  const groupName = name ?? `Circle ${groupSlug}`;

  const [group] = await db
    .insert(schema.groups)
    .values({
      slug: groupSlug,
      name: groupName,
      visibility: 'public',
      color: '#3f8f82',
      createdBy: adminUserId,
    })
    .returning();

  if (!group) throw new Error('Failed to create group');

  // The group keeps a separate admin so the member under test is never the
  // last admin — leaveGroup() rejects that with a 409.
  await db.insert(schema.groupMemberships).values({
    groupId: group.id,
    userId: adminUserId,
    role: 'admin',
  });

  return { id: group.id, slug: group.slug, name: groupName };
}

export async function deleteGroup(groupId: string): Promise<void> {
  const db = serviceDb();
  await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
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

/**
 * Put a user on the global points boards. period_start must match
 * currentPeriodStartSql() in lib/services/community.ts, so the weekly row is
 * truncated in Postgres rather than computed in JS. Rows cascade away with
 * deleteTestUser().
 */
export async function seedLeaderboardScore(
  userId: string,
  score: number,
  opts: { streakDays?: number } = {}
): Promise<void> {
  const db = serviceDb();
  await db.execute(sql`
    insert into user_scores (user_id, group_id, period, period_start, score)
    values
      (${userId}, ${schema.GLOBAL_GROUP_ID}, 'all_time', '1970-01-01'::date, ${score}),
      (${userId}, ${schema.GLOBAL_GROUP_ID}, 'weekly', date_trunc('week', now())::date, ${score})
    on conflict (user_id, group_id, period, period_start)
      do update set score = excluded.score
  `);
  if (opts.streakDays !== undefined) {
    await db
      .update(schema.users)
      .set({ streakDays: opts.streakDays })
      .where(eq(schema.users.id, userId));
  }
}

export async function getUserReputation(userId: string): Promise<number> {
  const db = serviceDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { reputationScore: true },
  });
  return user ? Number(user.reputationScore) : 0;
}
