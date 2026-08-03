import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ensureUserRecord } from '@/lib/auth/ensure-user';
import { createServiceDb } from '@/lib/db';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('returnUrl') || '/feed';

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  // Ensure the application user row exists for OAuth sign-ins, matching the
  // email/password signup path in LoginForm.tsx.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (user && !userError) {
    try {
      await ensureUserRecord(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create profile';
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(message)}`, request.url)
      );
    }

    // Newly created users (and any user that hasn't finished onboarding) must
    // complete the onboarding wizard before they can like, comment, or join
    // circles. Redirect them to /register/complete with the original returnUrl.
    const db = createServiceDb();
    const profile = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { painfulToolStackTask: true },
    });
    if (!profile?.painfulToolStackTask) {
      return NextResponse.redirect(
        new URL(`/register/complete?returnUrl=${encodeURIComponent(next)}`, request.url)
      );
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
