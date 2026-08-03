'use server';

import { getUser } from '@/lib/auth/server';
import { ensureUserRecord } from '@/lib/auth/ensure-user';

/**
 * Ensure the currently signed-in Supabase user has a matching `public.users`
 * row. Called from the client login form after a successful sign-in so the
 * header and protected routes see the user as logged in immediately.
 */
export async function ensureUserProfile(): Promise<{ error?: string }> {
  const { user, error } = await getUser();
  if (error || !user) {
    return { error: error?.message ?? 'Not authenticated' };
  }

  try {
    await ensureUserRecord(user);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create user profile' };
  }
}
