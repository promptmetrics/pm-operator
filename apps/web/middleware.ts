import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILE_REGEX = /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff2?|ttf|eot)$/;

const COMMUNITY_ROUTE_REGEX =
  /^\/(feed|g\/|p\/|u\/|leaderboards|settings|search|notifications|moderation)(\/|$)/;

function isApiV1Write(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/v1/')) return false;
  const method = request.method;
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

function needsProtection(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and internal Next.js routes are always public.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/mcp') ||
    pathname.startsWith('/static/') ||
    PUBLIC_FILE_REGEX.test(pathname)
  ) {
    return false;
  }

  if (COMMUNITY_ROUTE_REGEX.test(pathname)) return true;
  if (isApiV1Write(request)) return true;

  return false;
}

function buildReturnUrl(request: NextRequest) {
  return encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const isProtected = needsProtection(request);
  const returnUrl = buildReturnUrl(request);

  if (!isProtected) {
    return response;
  }

  if (userError || !user) {
    return NextResponse.redirect(new URL(`/login?returnUrl=${returnUrl}`, request.url));
  }

  // Authenticated users must complete onboarding before accessing protected routes.
  const { data: profile } = await supabase
    .from('users')
    .select('painful_tool_stack_task')
    .eq('id', user.id)
    .single();

  const onboardingComplete = Boolean(profile?.painful_tool_stack_task);

  if (!onboardingComplete) {
    return NextResponse.redirect(new URL(`/register/complete?returnUrl=${returnUrl}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
