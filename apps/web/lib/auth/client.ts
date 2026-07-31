import { createBrowserClient } from '@supabase/ssr';

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

function missingEnvClient(): SupabaseBrowserClient {
  return new Proxy({} as SupabaseBrowserClient, {
    get(_target, prop) {
      if (prop === 'auth') {
        return new Proxy(
          {},
          {
            get(_authTarget, authProp) {
              return () => {
                throw new Error(
                  `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables (tried Supabase.auth.${String(authProp)})`
                );
              };
            },
          }
        );
      }
      throw new Error(
        `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables (tried Supabase.${String(prop)})`
      );
    },
  });
}

export function createAuthClient(): SupabaseBrowserClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return missingEnvClient();
  }

  return createBrowserClient(url, anonKey);
}
