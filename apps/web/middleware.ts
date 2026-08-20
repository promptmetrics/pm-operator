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
// extra segment).
//
// Note on the rest of /u/: COMMUNITY_ROUTE_REGEX's `u\/` branch consumes the
// slash and then requires another (`(\/|$)`), so it matches only the bare
// `/u/` index — `/u/{slug}` and its sub-paths have always fallen through this
// middleware as public, with the services layer enforcing visibility
// (asserted in e2e/access-matrix.spec.ts). This allowlist exists so the two
// DevCard paths short-circuit before the community gate, not because it is
// the only public /u/ surface.
const PUBLIC_DEVCARD_REGEX = /^\/(?:u\/[^/]+\/devcard|api\/og\/devcard\/[^/]+)\/?$/;

// The public read surface, i.e. the pages a crawler is supposed to fetch: a
// circle, a post inside one, an author profile, and the feed. Mirrors what
// sitemap.ts advertises.
//
// Anchored the same way COMMUNITY_ROUTE_REGEX is, and for the same reason: the
// slug groups are `[^/]+`, so `/g/{circle}` and `/g/{circle}/{post}` match while
// `/g/` alone does not — that bare path is gated above. `/u/{slug}` matches but
// `/u/{slug}/followers` does not — sub-paths keep the private cache defaults.
const PUBLIC_READ_REGEX = /^\/(?:g\/[^/]+(?:\/[^/]+)?|u\/[^/]+|feed)\/?$/;

// Presence of a Supabase session cookie, without a DB or network call.
// @supabase/ssr names it sb-<project-ref>-auth-token and chunks large tokens
// into `.0`/`.1` suffixes, so match on the stem rather than an exact name.
function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

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
    pathname.startsWith('/api/img/') ||
    pathname.startsWith('/static/') ||
    PUBLIC_FILE_REGEX.test(pathname)
  ) {
    return false;
  }

  // OAuth Authorization Server endpoints are public by design: /oauth/authorize
  // redirects to /login itself when there's no session, and the /api/oauth/*
  // machine endpoints authenticate via PKCE + client_id (not a Supabase
  // session). The .well-known metadata is discovery-only. These already fall
  // through to `return false` below; this carve-out makes the intent explicit.
  if (
    pathname.startsWith('/oauth/') ||
    pathname.startsWith('/api/oauth/') ||
    pathname.startsWith('/.well-known/oauth-authorization-server')
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

// Public post and circle pages answered anonymous requests with
// `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` —
// Next's default for a dynamic route, and every route here is dynamic because
// app/layout.tsx forces it. To a crawler `private` + `no-store` reads as
// personalized content, which is a bad signal for a page we want indexed.
//
// So we correct the SIGNAL without caching anything: `public` drops the
// personalized claim, while `max-age=0, must-revalidate` still means no shared
// cache may serve a stored copy without revalidating. That distinction matters
// here — Cloudflare sits in front of Vercel and largely ignores `Vary: Cookie`,
// so anything genuinely cacheable at the edge could be handed to the wrong
// viewer. If you ever raise this to a real `s-maxage`, the safety has to come
// from a Cloudflare cache rule that bypasses on the auth cookie, NOT from Vary.
//
// We ask for `Vary: Cookie` below, but verified against a production build Next
// rewrites Vary on RSC routes and drops it. That is tolerable precisely because
// nothing here is storable-and-servable; do not lean on it.
//
// Only ever applied when there is no session cookie, so an authenticated render
// keeps Next's private defaults untouched.
function markPubliclyCacheable(response: NextResponse) {
  response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  const vary = response.headers.get('Vary');
  if (!vary) {
    response.headers.set('Vary', 'Cookie');
  } else if (!/(^|,)\s*cookie\s*(,|$)/i.test(vary)) {
    response.headers.set('Vary', `${vary}, Cookie`);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const signedIn = hasAuthCookie(request);
  const isPublicRead = !signedIn && PUBLIC_READ_REGEX.test(request.nextUrl.pathname);

  if (!url || !anonKey) {
    const bare = NextResponse.next();
    return isPublicRead ? markPubliclyCacheable(bare) : bare;
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // No session cookie means there is no session to read or refresh, so skip the
  // Supabase Auth round trip entirely. It used to run before needsProtection(),
  // which billed every anonymous crawler hit on a public post for one network
  // call to Supabase.
  if (!signedIn) {
    if (needsProtection(request)) {
      if (isApiV1(request)) {
        return apiError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      return NextResponse.redirect(
        new URL(`/login?returnUrl=${buildReturnUrl(request)}`, request.url)
      );
    }
    return isPublicRead ? markPubliclyCacheable(response) : response;
  }

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
