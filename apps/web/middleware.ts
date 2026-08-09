import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILE_REGEX = /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff2?|ttf|eot)$/;

// READ THE TRAILING `(\/|$)` BEFORE TOUCHING THIS.
//
// It anchors the match to the end of the prefix, so the `g\/`, `p\/`, and `u\/`
// branches only ever match the bare index paths — `/g/`, `/p/`, `/u/`. An
// actual post URL like `/g/show-your-build/my-post` does NOT match and is
// therefore PUBLIC, which is the intended product behavior: non-members read
// posts and circles, and are prompted to sign in when they try to like,
// comment, or join.
//
//   /g/                      -> true  (gated)
//   /g/show-your-build       -> false (public)
//   /g/show-your-build/post  -> false (public)
//   /settings                -> true  (gated)
//
// "Tidying" this to `^\/(g|p|u)\//` silently kills public post sharing — every
// shared link would bounce to /login and every crawler would unfurl the login
// page. access-matrix.spec.ts asserts the anonymous 200 so CI catches that.
//
// Because these pages are public, postVisibilityFilter (services/posts.ts) —
// not this gate — is what decides which posts an anonymous caller may read.
const COMMUNITY_ROUTE_REGEX =
  /^\/(g\/|p\/|u\/|leaderboards|settings|search|notifications|moderation|messages|bookmarks)(\/|$)/;

// T5G: the ONLY two public carve-outs inside the otherwise gated /u/ space —
// the shareable DevCard page and the PNG that OG unfurlers fetch for it.
//
// Read this as an exact-segment allowlist, not a prefix:
//   - `^` and `\/?$` anchor BOTH ends, so the whole pathname must be consumed.
//   - the slug is `[^/]+`, which cannot span a `/`, so the match is pinned to
//     exactly one slug segment.
// Together those mean the pattern admits `/u/{slug}/devcard` and nothing that
// merely starts with it: `/u/{slug}` fails (no `/devcard` tail),
// `/u/{slug}/followers` fails (wrong literal), `/u/{slug}/devcard/edit` fails
// (`$` is never reached), and `/u/{a}/{b}/devcard` fails (`[^/]+` cannot eat the
// extra segment). Every other /u/ route stays behind auth + onboarding.
// A prefix test (`startsWith('/u/')`, or dropping the `$`) would expose the
// whole profile space, so keep both anchors when touching this.
const PUBLIC_DEVCARD_REGEX = /^\/(?:u\/[^/]+\/devcard|api\/og\/devcard\/[^/]+)\/?$/;

function isApiV1(request: NextRequest) {
  return request.nextUrl.pathname.startsWith('/api/v1/');
}

function isApiV1Write(request: NextRequest) {
  if (!isApiV1(request)) return false;
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

  // Checked BEFORE the community gate so the two DevCard paths win, and after
  // the static-asset bail-outs so it stays a narrow, explicit exception.
  if (PUBLIC_DEVCARD_REGEX.test(pathname)) return false;

  if (COMMUNITY_ROUTE_REGEX.test(pathname)) return true;
  if (isApiV1Write(request)) return true;

  return false;
}

function buildReturnUrl(request: NextRequest) {
  return encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
}

function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Content-Type': 'application/json' } }
  );
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
  const isApi = isApiV1(request);

  if (!isProtected) {
    return response;
  }

  if (userError || !user) {
    if (isApi) {
      return apiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
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
    if (isApi) {
      return apiError(403, 'ONBOARDING_INCOMPLETE', 'Complete onboarding before performing this action');
    }
    return NextResponse.redirect(new URL(`/register/complete?returnUrl=${returnUrl}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
