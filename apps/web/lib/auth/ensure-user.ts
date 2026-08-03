import 'server-only';

import { eq, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createServiceDb } from '@/lib/db';

function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      // Collapse runs of non-alphanumeric characters into a single hyphen.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'user'
  );
}

async function uniqueUserslug(base: string): Promise<string> {
  const db = createServiceDb();
  let slug = sanitizeSlug(base);
  let attempt = 0;

  while (attempt < 10) {
    const candidate = attempt === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await db.query.users.findFirst({
      where: eq(sql`lower(${schema.users.userslug})`, candidate.toLowerCase()),
      columns: { id: true },
    });
    if (!existing) return candidate;
    attempt++;
  }

  // Fallback to a fully random suffix if the deterministic base is exhausted.
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function fullNameFromMetadata(user: SupabaseUser): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.full_name ?? meta.name ?? meta.fullName ?? meta.user_name ?? null;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function pictureUrlFromMetadata(user: SupabaseUser): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.avatar_url ?? meta.picture ?? meta.avatar ?? null;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Ensure a `public.users` row exists for the authenticated Supabase user.
 * Idempotent: if the row already exists, no changes are made.
 *
 * This is required because the repo intentionally has no database trigger that
 * creates application users from `auth.users`; the application layer owns the
 * user profile (onboarding task, reputation, preferences, etc.).
 */
export async function ensureUserRecord(user: SupabaseUser): Promise<void> {
  if (!user.email) {
    throw new Error('Cannot create a user record without an email address');
  }

  const db = createServiceDb();
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { id: true },
  });
  if (existing) return;

  const emailLocalPart = user.email.split('@')[0] ?? 'user';
  const fullName = fullNameFromMetadata(user);
  const userslug = await uniqueUserslug(fullName || emailLocalPart);
  const username = fullName || userslug;

  await db.insert(schema.users).values({
    id: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    username,
    userslug,
    fullName,
    pictureUrl: pictureUrlFromMetadata(user),
    aboutMe: null,
    painfulToolStackTask: '',
    role: 'member',
    reputationScore: '0',
    streakDays: 0,
    longestStreakDays: 0,
    followerCount: 0,
    followingCount: 0,
    preferences: {},
  });
}
