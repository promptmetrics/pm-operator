import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type SupabaseServerClient = ReturnType<typeof createServerClient>;

function missingEnvClient(): SupabaseServerClient {
  return new Proxy({} as SupabaseServerClient, {
    get(_target, prop) {
      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
        };
      }
      throw new Error(
        `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables (tried Supabase.${String(prop)})`
      );
    },
  });
}

export async function createAuthServerClient(): Promise<SupabaseServerClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return missingEnvClient();
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method can throw in Server Components when cookies
          // are being set after the response has started streaming. Auth
          // mutations should run in Server Actions or Route Handlers where
          // this path is reachable.
        }
      },
    },
  });
}

export async function getSession() {
  const supabase = await createAuthServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return { session: null, error };
  }

  return { session, error: null };
}

export async function getUser() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error };
  }

  return { user, error: null };
}
