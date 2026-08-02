# Community-portal screen designs (T8.11)

> Status: **spec, not code.** These are token-aligned design specs for the six community-portal screens that were orphaned mid-migration (WS6 shipped the shell, header, circle/profile/feed pages; the screens below were left without a design to rebuild against). Each spec is derived from the existing shell + the Paper v3 token system (`packages/ui/src/styles/tokens.css`) and the WS6 reference pages, so the rebuild can follow without re-deriving. No implementation work here — review before any rebuild.

**Token contract (Paper v3).** All specs use these CSS custom properties from `packages/ui/src/styles/tokens.css`:

- **Ink/text:** `--pm-ink` (primary), `--pm-ink-2` (secondary), `--pm-muted` (tertiary)
- **Paper/surfaces:** `--pm-paper` (base), `--pm-paper-2` (raised), `--pm-paper-inset` (recessed)
- **Lines:** `--pm-line` (default border), `--pm-line-2` (strong)
- **Accents:** `--pm-coral` / `--pm-coral-dark` (primary action/brand), `--pm-green` / `--pm-green-line` (success), `--pm-amber` (warning), `--pm-danger` / `--pm-danger-bg` (destructive)
- **Shape/shadow:** `--pm-radius-*`, `--pm-shadow` / `--pm-shadow-lg`, `--pm-focus` (focus ring)
- **Type:** `font-serif` for headings (Paper v3 editorial voice), system sans for body/UI

**Shared shell.** Every screen sits inside the existing community layout: a `--pm-paper` background, max-width container, the WS6 header cluster, and the same card/border/`--pm-radius` rhythm as the circle and profile pages. Components come from `@pm-operator/ui` (`Button`, `Card`, `Input`, `Checkbox`, `Toast`).

## Contents

1. [Login / Register](#login)
1. [Onboarding](#onboarding)
1. [Search](#search)
1. [Notifications](#notifications)
1. [Settings](#settings)
1. [Moderation](#moderation-queue)

---

## Login

### Purpose

Single-form dual-mode authentication and registration screen for the PromptMetrics operator portal. One form serves both `/login` (sign-in default) and `/register` (sign-up default, via `initialMode="sign-up"`); the user flips between the two modes in-place without a navigation. The screen authenticates against Supabase Auth (email/password or OAuth: GitHub, Google, LinkedIn OIDC), then redirects to the `returnUrl` searchParam (default `/feed`). New users who land on a protected route without a completed onboarding task are redirected by `middleware.ts` to `/register/complete?returnUrl=...`; the `/register/complete` page in turn bounces unauthenticated visitors back to `/login?returnUrl=/register/complete`.

This screen is a **pure client component** (`'use client'`). It issues **no app-DB queries of its own** — only Supabase Auth calls (external service). The ≤3-concurrent-DB-query gate applies downstream to whatever route the redirect targets (see Data & redirect flow).

### Layout

The screen renders full-bleed on the warm paper background, outside the community `Header` shell (the header shows the unauthenticated `Log in` / `Create account` buttons, but on `/login` and `/register` the body is a centered card — the header is intentionally absent here so the auth moment is focused). The card is a single elevated panel, `max-w-md`, centered both axes on `min-h-screen`.

```
┌──────────────────────────────────────────────────────────┐
│                  bg-[var(--pm-paper)]  full-bleed        │
│                                                          │
│            ┌──────────────────────────────────┐          │
│            │  rounded-2xl  border --pm-line   │          │
│            │  bg --pm-paper-inset            │          │
│            │  shadow --pm-shadow-lg  p-8     │          │
│            │                                  │          │
│            │   PROMPTMETRICS OPERATOR         │          │  ← eyebrow, --pm-coral-dark, uppercase tracking-widest
│            │   Welcome back  /  Join the …    │          │  ← h1, font-serif text-3xl
│            │   A Skool-style space for AI …   │          │  ← --pm-muted
│            │                                  │          │
│            │   [ Continue with GitHub     ]   │          │  ← Button variant=secondary size=lg, w-full
│            │   [ Continue with Google    ]   │          │
│            │   [ Continue with LinkedIn  ]   │          │
│            │   We only read your public …    │          │  ← --pm-muted-soft, text-xs
│            │                                  │          │
│            │   ─────────── or email ────────── │          │  ← hairline divider w/ inset label
│            │                                  │          │
│            │   Email                          │          │  ← Input
│            │   [__________________________]   │          │
│            │   Password          [Show]       │          │  ← Input + abs-positioned toggle
│            │   [__________________________]   │          │
│            │   (form-level error, role=alert) │          │  ← only when errors.form
│            │   [   Sign in  /  Create account ]│          │  ← Button variant=primary size=lg, w-full
│            │                                  │          │
│            │   Create an account · Forgot …   │          │  ← --pm-link inline links
│            │                                  │          │
│            │   EU-hosted · Public knowledge … │          │  ← --pm-muted-soft, text-xs
│            └──────────────────────────────────┘          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Stack order top-to-bottom inside the card (all `space-y-6` outer; inner groups `space-y-3` / `space-y-4`):

1. **Header block** — eyebrow + serif h1 + subtitle. h1 text is mode-dependent (`Welcome back` vs `Join the community`).
2. **OAuth block** — three `Button variant="secondary" size="lg"` (GitHub, Google, LinkedIn), full width, stacked `gap-3`; a one-line scope note below in `--pm-muted-soft`.
3. **Divider** — hairline `border-t --pm-line` with a centered `or email` chip on `--pm-paper-inset` background (the chip must sit on the card's inset bg so the line reads as passing behind it).
4. **Email form** — `Input` (email) + password `Input` with an absolutely-positioned `Show`/`Hide` toggle at `right-3 top-[2.1rem]`, plus an optional `role="alert"` form-error line, then the primary submit `Button`.
5. **Mode-flip + forgot-password row** — `Create an account` / `Sign in instead` toggle (`--pm-link`) · `Forgot password?` (`--pm-link`, carries `returnUrl` forward).
6. **Footer line** — `EU-hosted · Public knowledge · Agent-ready API` in `--pm-muted-soft`.

### Components

**Reused (from `@pm-operator/ui/components`, do not redesign):**
- `Button` — `variant="primary"` for the email submit, `variant="secondary"` for the three OAuth buttons; `size="lg"` for all four full-width actions. The component already wires `focus-visible:shadow-[var(--pm-focus)]` and `disabled:opacity-60` — do not re-implement.
- `Input` — email + password fields. It already renders the `LabelPrimitive.Root` label in `--pm-ink`, the `aria-describedby`/`aria-invalid` wiring, and the `--pm-danger` error text with `role="alert"`. Pass `label`, `error`, `autoComplete`, `disabled`. Do not wrap the error a second time.
- `Link` (next/link) — for the `Forgot password?` link and any mode-flip that should be crawlable; the in-form mode flip stays a `<button>` (no URL change) since the route is shared.

**Reused from app:**
- `createAuthClient` (`@/auth/client` / `@/lib/auth/client`) — the Supabase browser client; the only network actor on this screen.
- `getAuthCallbackUrl` (`@/site-url`) — builds the OAuth/email-redirect target so `returnUrl` survives the round-trip.
- `Suspense` boundary in `page.tsx` — required because `useSearchParams` is used in a client component; the fallback is the same centered empty `<main>` so the layout doesn't jump when the client mounts.

**New / to add (this screen currently has gaps — the rebuild must close them):**
- **Error-from-URL banner.** The auth callback (`app/auth/callback/route.ts`) redirects to `/login?error=<msg>` on `exchangeCodeForSession` failure, but the current `LoginForm` only reads `returnUrl` and silently drops the `error` param. Rebuild must read `searchParams.get('error')` once on mount and seed it into `errors.form` as a banner (see States → OAuth error). This is the single most important correctness fix in the spec.
- **Loading overlay for OAuth.** OAuth `signInWithOAuth` redirects the browser away; between the call and the navigation there is a window where the user can click again. The submit buttons must enter `disabled` + a visible loading affordance the moment an OAuth handler fires (set `isLoading` before calling, same as the email path). Today `handleOAuth` does not set `isLoading`.
- **No new visual components** — no `Card`/`StatCard`/`Tabs`/`Avatar` are needed here. The card is a one-off styled `<div>` to keep the auth surface independent of the community card system (matches the existing implementation; do not swap it for the shared `Card` because the auth card uses `--pm-shadow-lg` + `--pm-paper-inset`, intentionally distinct from the `--pm-paper-2` community cards).

### States

**Default (sign-in).** `mode="sign-in"`, h1 = `Welcome back`, submit label = `Sign in`, `autoComplete="current-password"`, mode-flip link reads `Create an account`.

**Default (sign-up).** Reached either via `/register` (page passes `initialMode="sign-up"`) or by clicking `Create an account` from sign-in. h1 = `Join the community`, submit label = `Create account`, `autoComplete="new-password"`, mode-flip link reads `Sign in instead`. Password field still enforces min 8 chars client-side (matches `validateField`); the form does **not** add a confirm-password field by design — keep it that way.

**Field validation (on blur / on submit).** Per-field inline error via `Input`'s built-in `--pm-danger` text + `aria-invalid`. Email: required, regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Password: required, `>= 8` chars. These render inline under the field, not in the form-error slot.

**Bad credentials (email path).** `supabase.auth.signInWithPassword` returns an error → set `errors.form` to `error.message`. Render as a single `role="alert"` line in `text-sm text-[var(--pm-danger)]` above the submit button. The `Input` field errors are cleared for the fields involved but the form error persists until the next submit attempt (`setErrors(prev => ({...prev, form: undefined}))` runs at the start of `handleEmailSubmit`).

**OAuth error (inbound from callback).** When the user returns from an OAuth provider via `/auth/callback` and `exchangeCodeForSession` fails, the callback redirects to `/login?error=...`. The rebuild must surface this as the same `role="alert"` banner, seeded once on mount from `searchParams.get('error')`. Clear it on the next interaction (any field edit or submit). This is distinct from a synchronous `handleOAuth` `error` (e.g. provider misconfig), which writes to `errors.form` immediately.

**OAuth error (synchronous).** `supabase.auth.signInWithOAuth` rejects → `errors.form = error.message`, same banner. Also set `isLoading=false` (currently the OAuth path never resets a loading state — fix in rebuild).

**Onboarding redirect (new user, post-login).** After a successful sign-in/sign-up, the form calls `router.push(returnUrl)` (default `/feed`). If the authenticated user has not completed the onboarding task (`painful_tool_stack_task` empty), `middleware.ts` redirects that target request to `/register/complete?returnUrl=<original>`. The login screen does **not** need to know about onboarding — the gate lives in middleware. The only requirement: the login screen must forward `returnUrl` faithfully through `getAuthCallbackUrl(returnUrl)` so it survives the OAuth round-trip and the middleware can restore it.

**Email sign-up (unconfirmed email).** Supabase `signUp` may succeed (return no error) but the subsequent `signInWithPassword` will fail if email confirmation is required. The current code surfaces this as a form error from the `signInWithPassword` call. The rebuild should keep this behavior; optionally add a `--pm-green` / `bg-[var(--pm-green-bg)]` confirmation banner (`role="status"`) when `signUp` succeeds telling the user to check their inbox — but only if email confirmation is enabled in the Supabase project config. Mark this as conditional in the checklist.

**Loading.** `isLoading` disables all form `Input`s and all action `Button`s (the shared `Button` already applies `disabled:pointer-events-none disabled:opacity-60`). The primary submit button keeps its label (no spinner widget exists in the shared kit; do not invent one — the disabled state is the affordance). For the email path, `isLoading` is set before the await and cleared in `finally`. The OAuth path must do the same in the rebuild.

**Empty / unauthenticated.** This screen is the unauthenticated entry — there is no "empty data" state. The only empty-state concern is the `Suspense` fallback in `page.tsx`: a bare centered `<main>` with the same `min-h-screen flex items-center justify-center` so the eventual card mount doesn't cause a layout shift.

### Data & redirect flow (DB-concurrency constraint)

This screen is **zero app-DB queries by design** — all auth goes to Supabase. The hard ≤3-concurrent-query constraint is therefore satisfied trivially here. The constraint matters for the redirect targets:

- **`/feed`** (default) — bounded by the feed page's own wave budget; not this screen's concern.
- **`returnUrl`** (deep link) — forwarded verbatim; the destination owns its wave budget.
- **`/register/complete`** (onboarding, via middleware) — issues **one** profile query (`db.query.users.findFirst`, single row by id) to read `painful_tool_stack_task` + `preferences`; Step 2 adds **one** `listRecommendedCircles(db, stackTags)` call, sequential after Step 1. No fan-out. This is the pool-safe pattern already shipped in `app/register/complete/page.tsx` and the DevCard page (`Promise.all` of ≤2, then a trailing `getUserBadges`). The login screen must not add any parallel fetch of its own to this chain.

**Trailing/deferred note:** there is nothing to defer on the login screen itself. The only "trailing" fetch in the auth chain is the middleware's single profile read, which is already sequential and bounded.

### Responsive behavior

- **Mobile (`<md`).** Card is `w-full` minus `px-4` page padding; `max-w-md` still caps it on large phones. The outer `<main>` uses `px-4 py-12`. The `Show`/`Hide` password toggle stays absolutely positioned at `right-3` — verify it doesn't collide with the `Input`'s right padding on narrow widths (the `Input` has `px-3`; the toggle sits in the padding region, which is fine, but the password field may need extra right padding so typed dots don't underlap the toggle on very narrow screens — add `pr-10` to the password `Input` via the `className` prop in the rebuild).
- **≥lg.** Card centers in the viewport; nothing else changes. The header eyebrow + serif h1 scale is fixed (`text-3xl`); do not bump it — the card is meant to feel compact and confident, not a marketing hero.
- **No header shell on this route.** The community `Header` is not rendered on `/login` or `/register` (these are top-level routes, not under the `(community)` route group). Keep it that way — the focused auth card is the intended UX. The unauthenticated `Header` (with its own `Log in` / `Create account` buttons) appears on community pages only.

### Accessibility

- **Focus management.** On mount, do **not** auto-focus the email field (it competes with the `Suspense` boundary and with screen-reader users' expectation of reading the h1 first). Let the user tab in. The first focusable element is the first OAuth button; tab order is: 3 OAuth buttons → email → password → Show/Hide toggle → submit → mode-flip → forgot-password.
- **Focus ring.** All interactive elements inherit `focus-visible:shadow-[var(--pm-focus)]` from the shared `Button` and `Input`. The custom `Show`/`Hide` `<button>` and the mode-flip / forgot-password links must also get a visible `--pm-focus` ring on keyboard focus — add `focus-visible:shadow-[var(--pm-focus)] focus-visible:outline-none` (or `focus-visible:ring-2 focus-visible:ring-[var(--pm-coral)]` rounded) to these in the rebuild; the current implementation relies on the browser default outline for these, which is inconsistent.
- **ARIA.**
  - Form error: `role="alert"` (already present) — keep it; ensure the `error`-from-URL banner uses the same role.
  - Field errors: the `Input` component already wires `aria-invalid` and `aria-describedby` to the error `<p>` — do not duplicate.
  - Mode-flip button: it changes the h1 and submit label; add `aria-pressed` is not appropriate (it's a toggle of mode, not a pressed state). Instead, when mode changes, the h1/region should be announced — wrap the card header in a section with `aria-live="polite"` is overkill; the simplest correct approach is to give the h1 an `id` and let the mode flip re-render it (screen readers will announce the new heading on focus, which is sufficient). Do not add `aria-live` to the form.
  - `Show`/`Hide` toggle: `aria-label` is already `Show password` / `Hide password` — keep; also add `aria-pressed={showPassword}` in the rebuild since it's a two-state toggle.
- **Keyboard flow.** Enter submits the email form from either field (native `<form>`). The OAuth buttons are `type="button"` so Enter inside a field does not trigger them. Esc has no special handling.
- **Color contrast.** `--pm-muted` (#6f665a) on `--pm-paper-inset` (#fbfaf6) ≈ 5.9:1 — passes AA for the subtitle and helper text. `--pm-muted-soft` (#8c8275) on `--pm-paper-inset` ≈ 3.6:1 — passes AA only for large text / non-essential chrome; it is used only for the scope note and footer line, which are `text-xs`. If the rebuild tightens to AAA, bump these two lines to `--pm-muted`. `--pm-coral-dark` (#a1482a) on `--pm-paper-inset` ≈ 5.4:1 — fine for the eyebrow. `--pm-danger` (#8f3324) on `--pm-paper-inset` ≈ 7:1 — strong for error text. `--pm-on-ink` (#f4efe7) on `--pm-coral` (#d97757) ≈ 4.6:1 — passes AA for the primary button label (large/bold).
- **Reduced motion.** No motion is introduced on this screen; transitions are limited to color (`transition-colors` on `Button`). No `prefers-reduced-motion` override needed.

### GDPR / EU-hosting notes (only where relevant)

- **Cookieless auth surface.** This screen sets no first-party analytics cookies itself. Supabase Auth sets essential auth cookies (HttpOnly, SameSite) — these are strictly-necessary and exempt from consent under GDPR/ePrivacy. Do not gate them behind a consent banner.
- **OAuth providers** (GitHub, Google, LinkedIn) set their own session cookies on their own domains and redirect back with an auth code; the portal never touches those cookies. The scope note `We only read your public profile and email` is the user-facing transparency statement — keep it accurate to the actual scopes requested (today the code requests default Supabase scopes only; if the rebuild adds `scopes` to `signInWithOAuth`, update this line to match).
- **Analytics.** `PostHogProvider` wraps the whole app (including this route) via `layout.tsx`. PostHog must be configured cookieless (e.g. `disable_cookie` / `localStorage` mode, or storageless autocapture) for EU traffic — flag this as a deploy-config dependency in the checklist, not a UI concern. The login screen itself fires no `trackEvent` (sign-in attribution is done in `Header` via `identifyAnalytics` after `/api/v1/me` resolves on the post-login route).
- **Return URL leakage.** `returnUrl` is forwarded to the OAuth provider via `getAuthCallbackUrl`. Do not place sensitive paths in `returnUrl`; it is user-supplied via the searchParam and is only ever used as a redirect target after auth — it is not logged to analytics from this screen.

### Rebuild checklist

1. **Keep the dual-mode single-form pattern.** `/login` and `/register` both render `<LoginForm>`; only `initialMode` differs (`sign-in` vs `sign-up`). Do not split into two screens.
2. **Card chrome** — `rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 shadow-[var(--pm-shadow-lg)]`, `max-w-md`, centered in `min-h-screen flex flex-col items-center justify-center px-4 py-12`. Do not switch to the shared `Card` component.
3. **Header block** — eyebrow `text-xs font-semibold uppercase tracking-widest text-[var(--pm-coral-dark)]` (`PromptMetrics Operator`), h1 `font-serif text-3xl font-semibold tracking-tight text-[var(--pm-ink)]` (mode-dependent text), subtitle `text-[var(--pm-muted)]`.
4. **OAuth block** — three `Button variant="secondary" size="lg" className="w-full"`, `space-y-3`; scope note `text-center text-xs text-[var(--pm-muted-soft)]` below. Set `isLoading` in `handleOAuth` and disable all buttons while an OAuth redirect is in flight (current code does not — fix).
5. **Divider** — hairline `border-t border-[var(--pm-line)]` with centered `or email` chip on `bg-[var(--pm-paper-inset)] px-2 text-[var(--pm-muted)]`.
6. **Email form** — `Input` (email, `autoComplete="email"`) + password `Input` (`autoComplete` = `current-password` | `new-password` by mode) with abs `Show`/`Hide` toggle. Add `pr-10` to the password `Input` className so dots don't underlap the toggle on mobile.
7. **Form error slot** — single `<p role="alert" className="text-sm text-[var(--pm-danger)]">` above the submit button; cleared at the start of `handleEmailSubmit`.
8. **Primary submit** — `Button type="submit" size="lg" className="w-full"`, label `Sign in` / `Create account`, `disabled={isLoading}`.
9. **Mode-flip + forgot row** — `flex items-center justify-center gap-2 text-sm`; mode-flip `<button>` toggles `mode` (no URL change); `Forgot password?` is a `next/link` to `/forgot-password?returnUrl=...` (forward `returnUrl`). Both in `text-[var(--pm-link)] hover:underline`. Add `focus-visible:shadow-[var(--pm-focus)]` to both.
10. **Footer line** — `text-center text-xs text-[var(--pm-muted-soft)]`: `EU-hosted · Public knowledge · Agent-ready API`.
11. **NEW: Error-from-URL banner** — on mount, read `searchParams.get('error')`; if present, seed `errors.form` with it (decoded) and render in the existing `role="alert"` slot. Clear on next field edit or submit. This closes the gap where `/auth/callback` redirects to `/login?error=...` and the current form silently drops it.
12. **NEW: `aria-pressed` on the `Show`/`Hide` toggle** and `focus-visible` rings on the toggle, mode-flip, and forgot-password link (see Accessibility).
13. **Redirect contract** — on success: `router.push(returnUrl)` where `returnUrl = searchParams.get('returnUrl') || '/feed'`. For OAuth/email redirect targets, always pass `getAuthCallbackUrl(returnUrl)` so `returnUrl` survives the round-trip. Do **not** redirect to `/register/complete` from this screen — onboarding gating is middleware's job.
14. **Do not add** a confirm-password field, a "remember me" checkbox, a CAPTCHA, or a marketing hero illustration. None exist in the Paper v3 shared kit for this screen and none are wanted.
15. **`Suspense` boundary in `page.tsx`** — keep the bare centered `<main>` fallback (identical to the card's outer `<main>`) so `useSearchParams` doesn't de-opt the route and the mount doesn't shift layout.
16. **Deploy-config dependency (not UI):** confirm PostHog is cookieless for EU traffic before this screen is considered production-ready — it wraps via `layout.tsx` and is active here even though the form itself fires no events.

---

## Onboarding

The 3-step post-registration wizard at `/register/complete` (T8.10, just shipped). The server page owns the current step via `users.preferences.onboardingStep`; a reload resumes in place. This spec documents the shipped architecture and proposes token-alignment polish, an improved empty-circles state, and a resumability/progress affordance — it does **not** redesign the flow.

### Purpose

Turn a freshly-registered user into an activated member in three bounded steps:
1. **Focus** — capture the painful tool-stack problem (the one write-blocker, checked by `requireOnboarding`) plus optional stack tags used to rank circle recommendations.
2. **Circles** — pick ≥2 circles to join; the server pre-ranks via `listRecommendedCircles` and pre-selects the top 2 so a user can continue in one click.
3. **Primer** — a reputation explainer with two finish CTAs: "Start exploring" → `/feed?welcome=1`, "Write your first post" → `/feed?welcome=1&compose=1`.

Steps 2–3 are activation nudges, not write-blockers; only Step 1's `painfulToolStackTask` gates writes elsewhere.

### Layout

```
┌─────────────────────────────────────────────┐  full-viewport, centered
│              min-h-screen, flex center        │  bg-background (var(--pm-paper))
│                                               │
│   ┌─────────────────────────────────────┐    │  Card  max-w-2xl, w-full
│   │  Welcome to PromptMetrics           │    │  CardHeader (font-serif title)
│   │  Three quick steps…                 │    │  CardDescription (text-muted)
│   │                                      │    │
│   │  ── onboarding progress ──          │    │  <ol aria-label="Onboarding progress">
│   │   ① Your focus ── ② Your circles ── ③ Get started │  3 segments + 2 connectors
│   │  ───────────────────────────────     │    │
│   │                                      │    │
│   │  [ step-specific content ]           │    │  Step1Focus | Step2Circles | Step3Primer
│   │                                      │    │
│   └─────────────────────────────────────┘    │  shadow var(--pm-shadow)
└─────────────────────────────────────────────┘
```

Step 1 content:
```
┌────────────────────────────────────────────┐
│ Input: "What is the most painful tool-      │  label, var(--pm-ink)
│        stack or agent problem…?"            │  placeholder example
│                                             │
│ Stack tags                                  │  text-sm font-medium
│ [☑ MCP] [☐ Next.js] [☑ Vercel] …           │  Checkbox grid, flex-wrap gap-3
│ [Add a custom tag ________] [Add]          │  Input + Button variant="secondary"
│ Selected: MCP, Vercel                       │  text-sm text-muted (only when ≥1)
│                                             │
│ [            Continue            ]          │  Button size="lg" w-full, primary
└────────────────────────────────────────────┘
```

Step 2 content (non-empty):
```
┌────────────────────────────────────────────┐
│ Based on your focus, here are circles       │  text-sm text-muted
│ worth joining. Pick at least two.           │
│                                             │
│ ┌──────────────┐  ┌──────────────┐         │  grid gap-3 sm:grid-cols-2
│ │ [A] Circle A  │  │ [B] Circle B  │         │  border rounded-xl p-3
│ │     1,234 mem │  │     890 mem   │         │  checked → border-coral, bg-paper-inset
│ │            ☑  │  │            ☑  │         │  hover  → bg-paper-inset
│ └──────────────┘  └──────────────┘         │
│ …                                           │
│ [     Join 2 circles     ]                  │  Button lg w-full; disabled if <2
└────────────────────────────────────────────┘
```

Step 3 content:
```
┌────────────────────────────────────────────┐
│ Your reputation starts now.                 │  font-serif text-lg, var(--pm-ink)
│ Reputation here is earned by helping…        │  text-sm text-muted
│ You're now following Circle A and Circle B.  │  only when joinedNames non-empty
│                                             │
│ [  Start exploring  ] [Write your first post] │  grid gap-3 sm:grid-cols-2
│                                             │   primary | secondary, size lg
└────────────────────────────────────────────┘
```

### Components

Reused (do not redesign):
- `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` — shell container (`max-w-2xl`, `shadow-[var(--pm-shadow)]`, `border-[var(--pm-line)]`, `bg-[var(--pm-paper-inset)]`, `rounded-xl`).
- `Input` — task field + custom-tag field (supports `label`, `error`, `disabled`).
- `Button` — `variant="primary"|"secondary"`, `size="lg"`, `w-full`.
- `Checkbox` (`@/components/ui/checkbox`) — stack-tag toggles; native `<input type="checkbox">` with `accent-[var(--pm-coral)]` and `focus-visible:shadow-[var(--pm-focus)]`.
- `trackEvent` / `identifyAnalytics` — Step 1 fires `signup`, Step 3 fires `onboarding_complete`.

New / to add for polish (all built on existing tokens — no new components invented):
- `OnboardingShell` (exists) — keep; refine the progress indicator visuals only (see Polish).
- `EmptyCirclesState` (extract from current inline block) — a dedicated subcomponent for the `circles.length === 0` path so it can carry the improved empty-state treatment below.
- `ResumabilityNotice` (new, tiny) — a one-line `text-xs text-[var(--pm-muted-soft)]` reassurance under the progress indicator on Steps 2–3: "Your progress is saved — you can leave and come back." Driven by `step > 1`.

### States

- **Empty — Step 1 task blank:** the `Continue` button stays enabled (validation is server-side via `saveOnboardingStep1`), but on submit with an empty `task` the action returns `{ error: 'Describe the problem you are working on.' }`; the form shows it as the Input's `error` (inline, `text-[var(--pm-danger)]`). No client-side disabling of the CTA — keep shipped behavior.
- **Empty — Step 1 stack tags:** no error; tags are optional. The "Selected: …" line is conditionally rendered only when `selectedTags.length > 0`.
- **Empty — Step 2 circle list (`circles.length === 0`):** shipped path renders a muted paragraph + a full-width "Skip and explore" `Button` that calls `finishOnboarding({ mode: 'explore' })`. **Polish:** lift this into `EmptyCirclesState` using the WS6 empty-card pattern — a centered block with a small serif headline ("No circles matched your stack yet"), the muted explainer, and the single `Skip and explore` CTA. Keep the `role="alert"` error paragraph below the button. Do **not** fabricate a circle list; the empty state must be honest because the ranking query genuinely returned nothing.
- **Loading:** every step sets `isLoading` on submit; `Button`s render `disabled` and the Step 2 CTA copies to `Joining…`. Inputs/checkboxes set `disabled`. No global spinner — the button state is the affordance, matching the rest of the app.
- **Error — server action returns `{ error }`:** shown inline as `<p role="alert" className="text-sm text-[var(--pm-danger)]">`. Step 2 distinguishes "Join at least two circles to continue." (client guard) from "Those circles are no longer available. Go back and pick others." (a circle became invite-only/paid mid-flight — server returns this when `joinable.length < 2`).
- **Unauthenticated:** the server page redirects to `/login?returnUrl=/register/complete` before rendering; the client actions also re-check via `requireMatchingSession` and return `{ error: 'You must be signed in to complete onboarding.' }`. No unauthenticated UI is rendered.
- **Already complete:** server redirects to `returnUrl || '/feed'` before rendering (including legacy users who finished the pre-wizard single-step onboarding — detected via `painfulToolStackTask` set and `onboardingStep === undefined`).
- **Resumability:** persisted by design. `onboardingStep` in `preferences` is the source of truth; reload re-renders at the saved step. The progress indicator reflects it (active/done states derived from `step`). No client state to lose.

### Responsive behavior

- **Mobile (< `sm`):** `Card` is `w-full` with `px-4` page padding. The progress indicator collapses the connector segments to `w-5` (vs `sm:w-8`) and the labels remain visible but compact (`text-xs`). Step 2 circle grid is single-column (`grid gap-3` → `sm:grid-cols-2`). Step 3 CTAs stack single-column then go 2-up at `sm`. The custom-tag row (`Input` + `Add` button) stays a horizontal flex on mobile — keep, the Input flexes to fill.
- **≥ `lg`:** `Card` caps at `max-w-2xl` and centers; nothing else changes. There is no `lg`-only layout. The shell deliberately uses the same `max-w-2xl` envelope as a focused task surface (wider than a modal, narrower than the feed) so onboarding reads as a contained moment, not a full app page.
- **Page shell:** onboarding renders **without** the community `Header` (it is outside the `(community)` route group), which is correct — no nav chrome during onboarding. Keep this; do not wrap in the app shell.

### Accessibility

- **Progress indicator:** the `<ol aria-label="Onboarding progress">` with one `<li>` per step is correct. The active step sets `aria-current="step"` (shipped). **Polish:** completed steps should expose `aria-current="step"` only for the active one (already correct) but should additionally be `aria-label`'d on the numeric badge — e.g. completed badge `aria-label="Step 1 complete"`, active badge `aria-label="Step 2, current"`, pending badge `aria-label="Step 3, not started"`. The numeric glyph alone is not sufficient for screen readers when the adjacent label is a separate text node. Add `aria-hidden="true"` to the connector `<span>`s (already present — keep).
- **Focus management:** on each step mount, the first interactive control should receive focus. Step 1: the task `Input` (autofocus the primary field). Step 2: the first circle card label. Step 3: the "Start exploring" button. Because steps transition via server redirect + full re-render, focus is naturally reset to the top of the page; an explicit `autoFocus` on the primary control of each step improves keyboard flow without adding a focus-manager.
- **Keyboard flow:** the task `Input` → stack-tag `Checkbox`es (native, in tab order) → custom-tag `Input` → `Add` button → `Continue` button — all native tab order, no roving needed. Enter in the custom-tag field calls `addCustomTag` (shipped `onKeyDown` guard — keep). Step 2 circle cards are `<label>`s wrapping a native checkbox, so the whole card is a single toggle with a visible focus ring via the inner input's `focus-visible:shadow-[var(--pm-focus)]`.
- **Color contrast:** active badge is `bg-[var(--pm-coral)]` (#d97757) with `text-[var(--pm-on-ink)]` (#f4efe7) — ~4.5:1, passes AA for the bold 12px glyph. Done badge `bg-[var(--pm-green)]` (#3a6447) on `--pm-on-ink` passes. Pending badge uses `text-[var(--pm-muted)]` (#6f665a) on paper — passes for non-text indicator use; the step *label* uses the same muted color and is small (`text-xs`), which is borderline — **polish:** bump the active label to `text-[var(--pm-ink)]` (shipped) and the pending labels to `text-[var(--pm-ink-2)]` (#43403a) for comfortable AA at 12px. Error text `text-[var(--pm-danger)]` (#8f3324) on paper passes AAA.
- **Reduced motion:** no animations beyond `transition-colors` on circle-card hover and button hover; both are color-only and safe under `prefers-reduced-motion`. No transforms or auto-scroll.

### Data fetching — pool-safe waves (HARD ≤3 constraint)

The shipped architecture is already pool-safe; this spec preserves it exactly. Call out for rebuild:

- **Page render (Step 1 & Step 3):** ONE query — `db.query.users.findFirst` for `{ painfulToolStackTask, preferences, fullName }`. No fan-out. Pool cost: 1.
- **Page render (Step 2):** TWO sequential queries — the same profile `findFirst` (wave 1), then `listRecommendedCircles(db, stackTags)` (wave 2). These are **sequential, not `Promise.all`** — the recommendations query depends on `stackTags` from the profile row anyway. Pool cost: 2, never concurrent. **Do not merge into a `Promise.all`** even though the data dependency would allow reordering — keep the sequential pattern as a guardrail against future edits that might add a third.
- **Trailing/deferred:** there is no trailing query today. If analytics enrichment or a "people you may know" nudge is added later, it MUST be a deferred client-side fetch (`/api/v1/...`) after hydration, never a third server query on this request path.
- **Actions:** each action does `readPreferences` (1 query) then a single `update` (1 query) — 2 sequential. `joinOnboardingCircles` does 1 `groups.findMany` (resolve names + restrict to public), then a **`for…of` sequential loop** of `joinGroup` calls (each its own `findFirst` + transaction) — explicitly **not `Promise.all`**, with a code comment citing the pool-starvation incident. Keep this comment; it is load-bearing documentation. The `joinedNames.length < 2` server guard returns a recovery error so a mid-flight visibility change doesn't strand the user.

### GDPR / EU notes

- Onboarding collects only the task text and self-selected stack tags — no tracking cookies, no third-party identifiers. `identifyAnalytics`/`trackEvent` are PostHog-no-op until provisioned and must remain cookieless when enabled (EU host). No consent banner is needed for this screen, but if analytics ships before this spec is rebuilt, the `signup`/`onboarding_complete` events must fire under the project's existing consent gate (same gate as the `Header` daily-visit event). No change required here — call it out so a rebuild doesn't accidentally add a fingerprinting call.

### Token-alignment polish (rebuild-ready diffs, no architecture change)

1. **Progress indicator — use generated utilities, not raw `var()` where a utility exists.** Replace `bg-[var(--pm-coral)] text-[var(--pm-on-ink)]` → `bg-primary text-primary-foreground`; `bg-[var(--pm-green)] text-[var(--pm-on-ink)]` → `bg-success text-primary-foreground`; the pending border `border border-[var(--pm-line)] text-[var(--pm-muted)]` → `border border-border text-muted-foreground`. Keep the connector as `bg-border` (was `bg-[var(--pm-line)]`). These resolve to the same `--pm-*` values but read consistently with the rest of the app and survive a token rename. Raw `var()` is fine where no utility exists (e.g. `--pm-on-ink` has no dedicated foreground utility — keep `text-[var(--pm-on-ink)]`).
2. **Pending label contrast** — bump pending step labels from `text-[var(--pm-muted)]` to `text-[var(--pm-ink-2)]` (see Accessibility).
3. **Circle card selected state** — replace ad-hoc `border-[var(--pm-coral)] bg-[var(--pm-paper-inset)]` with `border-primary bg-surface-elevated` (same values, consistent vocabulary). Hover stays `bg-surface-elevated`.
4. **Circle avatar tile** — the 36px serif initial tile uses `style={{ backgroundColor: c.color ?? 'var(--pm-coral)' }}`. Keep the inline style (circle colors are dynamic per-circle), but default the fallback to `var(--pm-coral)` and add a 1px `border border-[var(--pm-line)]` so light-colored circle `color` values stay legible against paper. Text on the tile stays `text-[var(--pm-on-ink)]`; if a circle supplies a very light `color`, that's a data-quality issue, not a token issue — note it but don't compensate in CSS.
5. **Error text** — replace `text-[var(--pm-danger)]` with `text-error` (utility exists via `--color-error`). Same value.
6. **ResumabilityNotice** (new) — under the `<ol>`, when `step > 1`, render:
   ```
   <p className="mb-6 text-center text-xs text-[var(--pm-muted-soft)]">
     Your progress is saved — close this and come back any time.
   </p>
   ```
   Use `--pm-muted-soft` (#8c8275) deliberately — it must read as secondary, below the step labels.
7. **Empty-circles state** — extract `EmptyCirclesState` using the WS6 empty-card pattern: a centered column (`text-center space-y-3 py-4`), a small serif headline `font-serif text-base font-semibold text-[var(--pm-ink)]` ("No circles matched your stack yet"), the muted explainer (`text-sm text-[var(--pm-muted)]`, shipped copy), then the full-width `Skip and explore` primary button. Keep the `role="alert"` server-error paragraph below. Do not add an illustration image (would add an asset + a request; not warranted for an edge state).
8. **Step 2 "Skip" affordance when circles exist** — the shipped non-empty path has no skip. Keep this; the top-2 pre-selection makes a skip unnecessary and a skip would bypass the ≥2 join intent. Do not add a skip link to the populated path.

### Rebuild checklist

- [ ] Server page (`app/register/complete/page.tsx`): unchanged — keep single `findFirst` profile query; keep sequential `listRecommendedCircles` only on Step 2; keep `onboardingComplete` / legacy-complete redirect; keep `returnUrl` handling.
- [ ] `OnboardingShell`: keep the 3-step `<ol>`; swap raw `var()` classes for `bg-primary`/`bg-success`/`border-border`/`text-muted-foreground`/`bg-border` utilities per Polish #1; bump pending label color per #2; add `aria-label` to each numeric badge per Accessibility.
- [ ] Add `ResumabilityNotice` (Polish #6) rendered when `step > 1`.
- [ ] `Step1Focus`: keep logic; no token changes required (Input/Checkbox/Button already token-correct). Confirm the `role="alert"` error paragraph stays for the post-submit server error path.
- [ ] `Step2Circles`: swap circle-card border/bg to `border-primary`/`bg-surface-elevated` (#3); add 1px `border-border` to the initial tile (#4); confirm `aria-label={`Join ${c.name}`}` on each checkbox (shipped — keep).
- [ ] Extract `EmptyCirclesState` from the inline `circles.length === 0` block (Polish #7); same calls (`finishOnboarding({ mode: 'explore' })`), improved layout.
- [ ] `Step3Primer`: keep the two CTAs and the joined-summary sentence; swap error `text-[var(--pm-danger)]` → `text-error` (#5). Confirm `onboarding_complete` `trackEvent` fires once on mount (shipped `useEffect` dep on `joinedCircleNames` — keep).
- [ ] `actions.ts`: **do not touch** the sequential `for…of` join loop or its pool-starvation comment. Re-verify `joinable.length < 2` guard and "Already a member" tolerance remain.
- [ ] No `Promise.all` introduced anywhere on this route (page or actions). Re-confirm via grep at rebuild.
- [ ] No third server query added to the page render; any future enrichment is a deferred client fetch.
- [ ] Accessibility pass: badge `aria-label`s, primary-control `autoFocus` per step, pending-label contrast.
- [ ] Visual QA on mobile: progress indicator wraps without truncation at 320px (labels `text-xs`, connectors `w-5`); Step 2 grid is single-column; Step 3 CTAs stack.

---

## Search

**Purpose.** A unified community search surface (`/search`) that lets a logged-in or anonymous visitor find posts, people, and circles from a single query. It replaces the current posts-only `SearchPage` (which renders a plain `<h1>Search</h1>` plus a row of sort `Button`s) with a Paper v3 tabbed result layout that matches the WS6 feed-card aesthetic, surfaces result-type counts, and offers recent/popular search shortcuts on the landing state. URL-driven (`?q=`, `?type=posts|people|circles`, `?sort=…`, `?page=…`) so results are shareable and the back button works.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  (site Header — sticky, existing shell)                         │
├──────────────────────────────────────────────────────────────────┤
│  max-w-5xl, mx-auto, px-4, py-8                                  │
│                                                                  │
│  Search                                                  [serif] │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🔍  Search posts, people, circles...                [↵]   │  │ ← Input + Button, paper-inset card, shadow
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [ Posts ·128 ] [ People ·14 ] [ Circles ·6 ]   ← Tabs (counts)  │
│  ────────────────────────────────────────────                    │
│  Sort: [ Relevance ] [ Newest ] [ Top ]    (Chip row, posts tab) │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  FeedCard (variant="card")          repeated, gap-4        │  │
│  │  …                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│                  [ Load more ] (secondary, centered)             │
└──────────────────────────────────────────────────────────────────┘

LANDING STATE (no q yet):
  Search input on top; below it two stacked panels:
    "Recent searches"  — Chip list of the user's last ~6 queries (localStorage)
    "Popular searches" — Chip list of top community queries (server, trailing)
```

**Type tab → result body mapping**

```
Posts tab   → vertical stack of <FeedCard variant="card"> (existing), gap-4
People tab  → 2-col (sm) / 3-col (lg) grid of PeopleResultCard (new, see below)
Circles tab → 2-col grid of CircleResultCard (new, mirrors group banner tile)
```

### Components

**Reused (do not redesign).**
- `Input` (`@pm-operator/ui/components/Input`) — the search field, `pl-9` with absolutely-positioned `Search` lucide icon, `aria-label="Search query"`.
- `Button` (`primary` submit, `secondary` for sort tabs and "Load more", `ghost` for icon-only actions) — uses `--pm-coral` / `--pm-coral-dark` / `--pm-paper-2` per its variants.
- `FeedCard` (`app/(community)/components/FeedCard.tsx`) with `variant="card"` (default) and `onClickResult` analytics hook — the posts-tab result row. Already accepts `SearchResult` shapes and renders `Tag` (circle color), `Badge` (Solved/Build/Question/Unanswered), `Avatar`, and `timeAgo` metadata. This is the "feed card aesthetic" anchor for the whole screen.
- `Tabs` / `TabsList` / `TabsTrigger` (`@pm-operator/ui/components/Tabs`) — `role="tablist"` with underline `border-b border-[var(--pm-line)]`; active trigger gets `--pm-coral` text + 2px coral underline. Triggers carry the count as a muted `--pm-muted` superscript (`·128`).
- `Chip` (`@pm-operator/ui/components/Chip`) — sort selector row and recent/popular search shortcuts. `aria-pressed`, pill `--pm-radius-pill`, active state `bg-[var(--pm-coral-tint)] text-[var(--pm-coral-dark)]`.
- `Avatar` + `LevelBadge` — used inside `PeopleResultCard` (`size="lg"` avatar, `badge={<LevelBadge level size="sm">}`).
- `Tag` — circle swatch label in `CircleResultCard`, using `color={group.color ?? 'var(--pm-coral)'}`.
- `Badge` (`variant="outline"`) — member-count / post-count pills on `CircleResultCard`.
- `Card` (`@pm-operator/ui/components/Card`) — wrapper for `PeopleResultCard` and `CircleResultCard`: `rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)] hover:shadow-[var(--pm-shadow-lg)]`.
- `Toast` (`useToast`) — error feedback on `loadMore` failure (existing pattern in current `SearchPage`).
- `StreakGrid` — optional flourish on `PeopleResultCard` (this week's streak, `days` array); omit if no streak to keep the card calm.
- `StatCard` — not used here (too heavy for result rows); counts live on tab triggers instead.

**New (design only — to be built).**
- `PeopleResultCard` — a compact Card: `Avatar` (lg) + `LevelBadge`, `font-serif` display name linking to `/u/{userslug}`, `@{userslug}` muted line, a `--pm-muted` stat line (`{postsCount} posts · {acceptedSolutions} solutions · {reputationScore} pts`), and an optional `StreakGrid` (size sm) if `streak?.current > 0`. Whole card is a `Link` to the profile.
- `CircleResultCard` — mirrors the WS6 group banner tile: a 44×44 rounded square (`rounded-xl`) filled with `group.color ?? --pm-coral` showing the circle initial in `font-serif text-[var(--pm-on-ink)]`; circle name (`font-serif text-base font-semibold text-[var(--pm-ink)]` linking to `/g/{slug}`); one-line `--pm-muted` description (`line-clamp-1`); a row of `Badge variant="outline"` chips for `{memberCount} members` and `{postsThisMonth} posts/mo`. Whole card links to the circle.
- `RecentSearches` (client) — reads last ≤6 unique queries from `localStorage` key `pm:recent-searches`, renders as `Chip` row; clicking submits the query. Write on every successful submit. Shown only on landing state and only when the list is non-empty (graceful no-op for anonymous/incognito where `localStorage` throws).
- `PopularSearches` (server-rendered) — a small Chip row of the top ~8 community queries by click volume (a cheap pre-aggregated table or a cached `SELECT term, count FROM search_clicks GROUP BY term ORDER BY count DESC LIMIT 8`). Rendered below Recent searches on the landing state only. Trailing query (see Data fetching).
- `EmptyResults` panel — reused for all three tabs: `rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center`, `font-serif text-lg` "No {type} found for "{q}"" + `--pm-muted` hint "Try a different term or browse /feed." Each tab can supply its own noun ("posts" / "people" / "circles").
- `SearchLoadingSkeleton` — 3× `<div>` shimmer rows matching FeedCard height (`h-32 rounded-xl bg-[var(--pm-paper-2)] animate-pulse`) for the posts tab; for people/circles, a 2-col grid of `h-40` skeleton cards. Used for the initial server-render loading and for tab-switch navigations via a `useState` pending flag (the page already uses client state).

### States

**Landing (no `q`).** Search input focused. Below it, stacked: `RecentSearches` (if any) then `PopularSearches` (if any). No tabs, no sort row, no results column. A one-line `--pm-muted` helper under the input: "Search across posts, people, and circles."

**Loading — initial server render.** The route component is `async` and server-rendered; while it resolves, Next shows the streaming boundary. Inside `SearchPage`, an `initialLoading` flag (true until the server props arrive via the React `key` reset effect that the current code already uses) renders `SearchLoadingSkeleton` for the active tab. No spinner.

**Loading — tab switch / sort change / load-more.** Client-side: keep existing results visible, set a `pending` boolean, show a slim `--pm-coral` 2px progress bar under the tab strip (not a full overlay) and append skeleton rows at the list tail for `loadMore`. Sort and type changes use `router.push` with `scroll: false`, mirroring the current `changeSort`.

**Empty results.** `EmptyResults` panel (above). If the active tab is empty but other tabs have counts, append a hint line: "Found {n} people and {m} circles instead →" with the two tabs as links (uses the tab counts from Wave 1). This turns a dead-end query into a cross-type nudge.

**Error.** `Toast` (`variant: 'error'`, `--pm-danger` text) on `loadMore` fetch failure — identical to the current `loadMore` catch. For an initial server-render failure, the route throws and Next's `error.tsx` boundary (paper-styled: `Card` with `--pm-danger` left border and a "Try again" `Button`) handles it. No silent empty state.

**Unauthenticated.** Search is fully readable anonymous (the existing `postVisibilityFilter` already gates visibility to public groups for logged-out users, and `rateLimit('anonymousPublicRead', …)` throttles). No login wall. People and Circles results for anonymous users must only surface public profiles and `visibility = 'public'` circles. The recent-searches `localStorage` still works anonymous. GDPR note: because search is anonymous-readable and cookieless, no consent banner is needed; the `RecentSearches` list is local-only (never transmitted) and `PopularSearches` is aggregate (no personal data), so neither triggers GDPR storage concerns. `trackEvent('search_submit', { q, type })` fires only when PostHog is provisioned and uses the existing cookieless/consent-respecting provider — no change to the cookieless posture.

### Responsive behavior

**Mobile (`<lg`, default — single column, `max-w-5xl` collapses to `px-4`).**
- Search input is full width; the submit `Button` drops below the input (`flex-col` on the form) rather than beside it, so the input isn't cramped on 375px.
- Tabs (`TabsList`) become a horizontally scrollable row with `overflow-x-auto` and snap-x; the active tab's underline stays pinned. Counts are hidden on `<sm` to save width (show `Posts` not `Posts ·128`).
- Sort `Chip` row scrolls horizontally the same way.
- People grid: 2 columns on `sm`, 1 column on `xs` (each `PeopleResultCard` stretches full width).
- Circles grid: 1 column on mobile.
- "Load more" button is full-width (`w-full`) on mobile, `auto` width centered on `lg`.

**Desktop (`≥lg`).**
- `max-w-5xl` centered, generous `py-8` rhythm.
- Search input + submit `Button` sit inline (`flex`).
- Tabs and sort row are full-width, left-aligned, not scrollable.
- People grid: 3 columns. Circles grid: 2 columns.
- No right rail — search is a focused single-column task; a rail would dilute it and add DB load.

### Accessibility

- **Search input.** `aria-label="Search query"` (existing). The form `onSubmit` prevents default when empty. `autoFocus` on landing state only (not on result state, to avoid yanking focus from keyboard users arriving via back button).
- **Tabs.** `Tabs` already renders `role="tablist"`; each `TabsTrigger` is `role="tab"` with `aria-selected` and `aria-controls`/`id` from `Tabs`'s `baseId`. Active tab content panel gets `role="tabpanel"` + `aria-labelledby`. Arrow-key navigation between tabs is provided by the Radix-based `Tabs` primitive — verify on rebuild. The count after each label is wrapped in `<span aria-hidden="true">·{count}</span>` so screen readers announce "Posts" not "Posts dot 128".
- **Sort chips.** `Chip` already emits `aria-pressed`. Group the row with `<div role="group" aria-label="Sort">`.
- **Result cards.** Each `FeedCard`, `PeopleResultCard`, and `CircleResultCard` is an `<article aria-labelledby={titleId}>` with a programmatically focusable heading link (`<Link>` on the title) — matches the existing `FeedCard` pattern. People/circle cards make the whole card a single link target (no nested interactive controls) so the card is one tab stop.
- **Keyboard flow.** Tab order: input → submit → tab strip → sort chips → first result card → … → "Load more". "Load more" is a real `<Button>` (focusable, Enter/Space activatable). Enter in the input submits the form (existing).
- **Focus management on tab switch.** When the user activates a different type tab, move focus to the first result card of the new panel (or to the `EmptyResults` heading if empty) so keyboard users aren't stranded on the trigger. On `loadMore` append, keep focus on the "Load more" button (don't move it).
- **Color contrast.** All text uses `--pm-ink` (#1c1c1c) / `--pm-ink-2` (#43403a) / `--pm-muted` (#6f665a) on `--pm-paper`/`--pm-paper-inset` (≥4.5:1 for body, ≥3:1 for large serif headings — passes AA). The coral active-tab underline and active `Chip` use `--pm-coral-dark` (#a1482a) text on `--pm-coral-tint` (12% coral over paper) — verify ≥4.5:1 on rebuild; if the tint is too light, fall back to `--pm-coral-dark` text on `--pm-paper-2`. `--pm-muted-soft` (#8c8275) is reserved for non-essential meta (tag hashes, timestamps) and never carries meaning alone.
- **Skeletons** are `aria-hidden` and the loading region carries `role="status"` + `aria-live="polite"` so screen readers announce "loading results" then "results loaded."
- **Reduced motion.** Skeleton `animate-pulse` and any hover `shadow-lg` transition are suppressed under `@media (prefers-reduced-motion: reduce)` (handled at the global level; the rebuild must not introduce new motion without guarding it).

### Data fetching (≤3 concurrent queries per request path)

The portal's hard constraint (a wide `Promise.all` starved the small DB pool on 2026-08-02) governs this design. The current `search/page.tsx` already runs a single `searchPosts` call. The redesign adds People and Circles result types and per-tab counts, so the budget must be planned explicitly.

**Per `/search` request, exactly one bounded wave of ≤3 concurrent queries:**

1. **Active-type page** (1 query) — the paginated result set for the `?type=` tab:
   - `type=posts` → existing `searchPosts(db, { q, sort, page, limit: 20 }, currentUserId)` (single internal query with a CTE; no fan-out).
   - `type=people` → new `searchPeople(db, { q, page, limit: 12 }, currentUserId)` — `ILIKE` on `users.fullName`/`users.username`/`users.userslug`, visibility-gated to public profiles for anonymous, ordered by reputation score (or by `sort` if we expose it for people later).
   - `type=circles` → new `searchCircles(db, { q, page, limit: 12 }, currentUserId)` — `ILIKE` on `groups.name`/`groups.slug`, filtered to `visibility = 'public'` for anonymous (mirrors the `postVisibilityFilter` philosophy), ordered by member count.
2. **Inactive-tab counts** (2 cheap `COUNT(*)` queries, run concurrently with #1) — so the tab triggers can show `Posts ·128 / People ·14 / Circles ·6` regardless of which tab is active. These are bounded `SELECT count(*) … <same WHERE as the full search, no rows returned>`.
   - For anonymous, both counts respect the public-only visibility filter.

```
Wave 1 (≤3 concurrent):
  Promise.all([
    activeTypePage,        // 1 query
    inactiveTypeACount,    // 1 COUNT(*) query
    inactiveTypeBCount,    // 1 COUNT(*) query
  ])
```

No Wave 2 needed for the result page itself.

**Trailing / deferred query.**
- `PopularSearches` (landing state only, i.e. `!q`) is a **trailing query after Wave 1**, run alone (1 concurrent): a cached/cheap `SELECT term, count FROM search_clicks GROUP BY term ORDER BY count DESC LIMIT 8`. On the landing state Wave 1 is empty (no active-type page), so the popular-searches query is the only query — well within budget. It MUST NOT be bundled into Wave 1 on result pages; it only fires when `q` is absent, where there is no Wave 1 to collide with. If a cache layer exists, prefer it here to avoid hitting the small pool at all.
- **`loadMore`** (client `fetch /api/v1/search?type=…&q=…&page=N+1`) hits the API route, which runs only the active-type page query (1 query) — no counts on subsequent pages. This keeps the load-more request path at 1 concurrent query.
- **`trackEvent('search_click', …)`** on result clicks is fire-and-forget client analytics, not a DB query.

**What this design explicitly forbids** (call out on rebuild): do NOT run `searchPosts + searchPeople + searchCircles` page queries in one `Promise.all` to "prewarm" the other tabs — that is the exact 3-wide fan-out that starves the pool, and it returns full row sets the user may never view. Counts only for inactive tabs; full pages are fetched on demand when the user switches tabs (a new bounded request).

### Pagination

- **Cursor-less, page-based** (matches the existing `searchPosts` + `/api/v1/search` route, which use `page`/`limit` and return `nextCursor` only as a hasMore flag). The redesign keeps `?page=N` in the URL so the back button restores position.
- **Posts:** `limit: 20`, "Load more" `Button` (secondary) appends the next page to the existing list (current behavior — preserve it).
- **People / Circles:** `limit: 12`, same "Load more" pattern; grids reflow as rows append.
- The "Load more" button is hidden when no `nextCursor`/`hasMore`. The `paginationMeta(query.page, query.limit, Boolean(result.nextCursor))` from the API route already exposes `hasMore` via `meta` — the client reads `json.meta?.hasMore` (current `loadMore` already does this).
- URL on load-more: the current code sets `page` in the URL on load-more — keep that so a refresh restores the accumulated page (the client re-fetches pages 1..N on mount if `page > 1`, OR — preferred for the pool budget — renders only page N and keeps earlier pages in client state without refetching; the current code does the latter and this design keeps it).

### Rebuild checklist

- [ ] Route `app/(community)/search/page.tsx`: parse `q`, `type` (`posts`|`people`|`circles`, default `posts`), `sort` (`relevance`|`new`|`top`), `page`. Run the single bounded Wave 1 (≤3). Pass `initialType`, `initialTypeCounts`, `initialResults`, `initialCursor`, `currentUserId` to `SearchPage`. On landing (`!q`), run the trailing `PopularSearches` query alone and pass `popularSearches`.
- [ ] New services `lib/services/search.ts`: add `searchPeople` and `searchCircles` (page-based, visibility-gated, return `{ results, nextCursor }`). Add `countSearchPosts` / `countSearchPeople` / `countSearchCircles` (cheap `COUNT(*)` with the same WHERE, no row fetch).
- [ ] API route `app/api/v1/search/route.ts`: extend `searchQuerySchema` with `type` enum (`posts`|`people`|`circles`); dispatch to the right service; keep `paginationMeta`. Load-more stays a single-query path.
- [ ] Component `SearchPage.tsx`: replace the plain `<h1>` + sort `Button` row with the Paper v3 layout — serif `<h1>` (`font-serif text-2xl font-semibold text-[var(--pm-ink)]`), search `Input` card, `Tabs` with counts, `Chip` sort row (posts tab only), result body per tab, `Load more`, `EmptyResults` with cross-type nudge.
- [ ] New `PeopleResultCard` and `CircleResultCard` components under `app/(community)/components/`, matching `FeedCard` visual weight (`Card`, `--pm-paper-inset`, `--pm-shadow`, hover `--pm-shadow-lg`).
- [ ] New `RecentSearches` (client, `localStorage`) and `PopularSearches` (server) Chip rows on landing state only.
- [ ] `EmptyResults` and `SearchLoadingSkeleton` partials.
- [ ] Wire `trackEvent('search_submit', { q, type })` on submit and `trackEvent('search_click', { query, type, position })` on result click (existing hook on `FeedCard`; add equivalent on people/circle cards).
- [ ] a11y pass: `role="tablist"/"tab"/"tabpanel"`, `aria-pressed` on sort chips, focus move to first result on tab switch, `aria-live="polite"` on skeleton region, `prefers-reduced-motion` guard on skeletons.
- [ ] Verify `--pm-coral-dark`-on-`--pm-coral-tint` contrast ≥4.5:1 for active tab/chip text; adjust to `--pm-paper-2` background if not.
- [ ] Responsive pass: mobile tab/sort horizontal scroll, single-column people/circles on `xs`, full-width "Load more" on mobile.
- [ ] Confirm no code path issues a 3rd concurrent query beyond Wave 1 (e.g. a stray `Promise.all` over people+circles+posts page queries). Add an inline comment at the `Promise.all` citing the 2026-08-02 pool-starvation incident, matching the style used in `g/[slug]/page.tsx`.

Relevant files (absolute paths):
- `/Users/izzy/Documents/pm-operator/apps/web/app/(community)/search/page.tsx`
- `/Users/izzy/Documents/pm-operator/apps/web/app/(community)/components/SearchPage.tsx`
- `/Users/izzy/Documents/pm-operator/apps/web/app/(community)/components/FeedCard.tsx` (result card aesthetic anchor)
- `/Users/izzy/Documents/pm-operator/apps/web/lib/services/search.ts` (add `searchPeople`/`searchCircles`/counts here)
- `/Users/izzy/Documents/pm-operator/apps/web/app/api/v1/search/route.ts` (extend with `type` dispatch)
- `/Users/izzy/Documents/pm-operator/packages/ui/src/styles/tokens.css` (token source of truth)
- `/Users/izzy/Documents/pm-operator/apps/web/app/(community)/g/[slug]/page.tsx` (bounded-wave reference pattern)

---

## Notifications

### Purpose

A personal inbox for signed-in operators, surfaced in two coupled surfaces: (1) the **header bell** (`NotificationBell.tsx`, always present in the shell for authenticated users) and (2) the **full Notifications page** (`/notifications`, `NotificationsPage.tsx`). The page is the authoritative, paginated history of everything the platform has pingged a user about; the bell is a lightweight, peek-style preview of the most recent unread items with a one-tap jump to the full page. Both share the same `Notification` shape, the same `notificationText` / `notificationHref` helpers, and the same Supabase Realtime subscription (`subscribeToUserNotifications`), so updates land in both surfaces without a refetch.

The eight notification types present in code (`packages/api/src/contracts/notifications.ts → NotificationType`) are: `comment`, `reaction`, `solution`, `invite`, `flag`, `flag_resolved`, `mention`, `badge`. Each carries a `payload` with optional `postId`, `commentId`, `actorId`, `actorSlug`, `actorUsername`, `groupSlug`, `inviteCode`, `flagId`, `reason`, `badgeSlug`, `badgeName`. The deep-link resolver (`notificationHref`) routes to `/g/{groupSlug}` → `/p/{postId}` → `/u/{actorSlug}` → `/notifications` as a fallback.

### Layout

The screen sits inside the established shell: `Header` (sticky, `max-w-6xl`, `border-b border-[var(--pm-line)]`, `bg-[var(--pm-paper)]/95` with `backdrop-blur-sm`) above a single centered column. The page container is `mx-auto max-w-3xl` (narrower than the 6xl feed, matching the personal-inbox rhythm of the devcard's `max-w-2xl`), padded with the shell's default outer gutters.

```
┌───────────────────────────────────── Header (sticky) ────────────────────────────────────┐
│  operator.promptmetrics   Feed  Leaderboards  Search     🔔(bell)  [avatar▾]              │
└──────────────────────────────────────────────────────────────────────────────────────────┘

   ╭──────────────────────── max-w-3xl (page) ────────────────────────────╮
   │                                                                        │
   │  Notifications                                   [ Mark all read ]     │   ← title row
   │  N unread                                                               │
   │  ────────────────────────────────────────────────────────────────────  │   ← hairline (pm-line)
   │                                                                        │
   │  ╭── Filter chips row (All / Unread / Mentions …) ────────────────╮    │
   │  │  [All]  [Unread]  [Mentions]  [Invites]  [Badges]              │    │   ← Chip (pill), overflow scroll
   │  ╰────────────────────────────────────────────────────────────────╯    │
   │                                                                        │
   │  Today                                                                 │   ← group header (serif, xs uppercase)
   │  ┌─────────────────────────────────────────────────────────────────┐   │
   │  │ ●  New comment on your post                  [Mark read]  ›  │   │   ← unread row (coral tint bg)
   │  │    @jane · circle/prompt-engineering · 2:14 PM                 │   │
   │  ├─────────────────────────────────────────────────────────────────┤   │
   │  │ ●  Someone mentioned you                         [Mark read] ›│   │
   │  │    @sam · post · 9:02 AM                                      │   │
   │  └─────────────────────────────────────────────────────────────────┘   │
   │                                                                        │
   │  This week                                                             │
   │  ┌─────────────────────────────────────────────────────────────────┐   │
   │  │    Your answer was accepted as the solution              ›     │   │   ← read row (paper-inset bg)
   │  │    @kris · Jul 28                                              │   │
   │  ├─────────────────────────────────────────────────────────────────┤   │
   │  │    You earned a new badge: "First Answer"                 ›     │   │
   │  │    Jul 26                                                      │   │
   │  └─────────────────────────────────────────────────────────────────┘   │
   │                                                                        │
   │           [ Load older ]   (trailing/deferred fetch)                   │
   │                                                                        │
   ╰────────────────────────────────────────────────────────────────────────╯

   Header bell dropdown (open state, w-80, anchored right):
   ┌────────────────────────────────────┐
   │ Notifications       [ Mark all read ]│
   │ ─────────────────────────────────── │
   │ ● New comment on your post          │   ← top 5 unread, dot = bg-primary (coral)
   │   @jane · today                      │
   │ ● Someone mentioned you             │
   │   @sam · today                      │
   │   …                                  │
   │ ─────────────────────────────────── │
   │            View all                 │   ← /notifications
   └────────────────────────────────────┘
```

### Components

**Reused (do not redesign):**
- `Button` (`variant="ghost"` size="sm" for Mark read / Mark all read; `variant="secondary"` size="sm" for the page-level Mark all read). The `secondary` variant already gives `bg-[var(--pm-paper-2)]` + `border-[var(--pm-line)]`, matching the devcard banner buttons.
- `Avatar` (size="sm") — optional, only if we surface the actor avatar in a redesigned row; the current code does not, and adding it is a new-component decision (see below).
- `Chip` (pill) — for the filter row. `active` state maps to `bg-[var(--pm-coral-tint)]` / `text-[var(--pm-coral-dark)]` which is exactly the unread-accent semantic we want; inactive uses `text-[var(--pm-muted)]` `hover:bg-[var(--pm-paper-2)]`.
- `Badge` (variant per type) — optional type tag in the row, e.g. `coral` for `mention`, `green` for `solution`/`badge`, `amber` for `flag`/`flag_resolved`, `blue` for `invite`, `default` for `comment`/`reaction`. All variants resolve to existing `--pm-*` tokens, so no new color is introduced.
- `Card` / `CardHeader` / `CardTitle` / `CardContent` — not used for the list rows (they are too heavy for a dense inbox); reserved for the empty-state and error-state containers, matching the WS6 `InviteOnlyPreview` and the devcard's bordered inset pattern.
- `Toast` (from `ToastProvider` already mounted in `layout.tsx`) — for surfacing mark-as-read failures and realtime reconnect notices instead of silent `if (res.ok)` drops.
- `RealtimeStatusDot` — already rendered globally by `RealtimeProvider`. The notifications page must **not** add a second status dot; the bell + page should rely on this shared indicator for live-update health. The bell's existing `aria-live` sr-only region (`liveRegionRef`) is retained for the count announcement; the dot covers channel-level health.
- `subscribeToUserNotifications` (from `lib/realtime.ts`) — the realtime subscription; reused as-is by both surfaces. Deduper is built in.

**New (page only; built from existing tokens):**
- `NotificationRow` — a presentational `<li>` that takes a `Notification` + `unread: boolean` and renders the row card. Border + bg swap on `unread`: unread uses `border-[var(--pm-coral)]/30 bg-[var(--pm-coral-tint-10)]`; read uses `border-[var(--pm-line)] bg-[var(--pm-paper-inset)]`. Radius `rounded-xl` (= `--pm-radius-lg`). The whole row body is a `Link` (`notificationHref`); clicking an unread row fires `markOneRead` optimistically (current behavior, kept).
- `NotificationGroupHeader` — a serif xs `uppercase tracking-[0.08em] text-[var(--pm-muted)]` label ("Today", "This week", "Earlier") matching the established WS6 section eyebrow used on the devcard ("This week", "Badges (N)") and the group page pinned-resources label.
- `NotificationsFilterBar` — a horizontally scrollable row of `Chip`s (All / Unread / Mentions / Invites / Badges) on mobile, wrapping on `≥lg`. State is a single `filter` string in the client; selecting a chip refetches with `?unreadOnly=true` (Unread) or client-filters by `type` for type chips. This replaces the current stateless list and is the only structural addition.

**Header bell (no structural change):** the existing `NotificationBell` dropdown is kept verbatim in shape — `w-80`, `rounded-xl`, `border-[var(--pm-line)]`, `bg-[var(--pm-paper-inset)]`, `shadow-[var(--pm-shadow-lg)]` (note: current code uses `shadow-lg` Tailwind utility; spec-aligned rebuild should switch to `shadow-[var(--pm-shadow-lg)]` to match the UserDropdown in `Header.tsx`). The unread dot inside a dropdown item is currently `bg-primary` (= `--pm-coral`); keep it. The badge count pill is `bg-[var(--pm-danger)] text-[var(--pm-on-ink)]` — keep, this is the established "urgent" accent for the count.

### States

- **Loading (page):** the current code sets a `Loading...` string. Spec replaces this with 3 skeleton rows matching the row geometry: `rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4` with an inner `animate-pulse` muted block (`bg-[var(--pm-paper-2)] h-4 w-3/4` + `h-3 w-1/3`). Skeletons keep layout stable so the filter chips and title do not jump.
- **Empty:** retained centered inset, promoted to a `Card`-shaped container: `rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center shadow-[var(--pm-shadow)]`. Headline `font-serif text-lg font-semibold text-[var(--pm-ink)]` ("No notifications yet"); subline `text-sm text-[var(--pm-muted)]` ("When someone mentions you, replies to your post, or invites you to a circle, it'll show up here."). No illustration is introduced (paper aesthetic favors restraint).
- **Error (fetch failed):** the current `fetchAll` silently flips `loading=false` and leaves the list empty on non-OK. Spec introduces an explicit error state: a `Card` with `border-[var(--pm-danger)]/30 bg-[var(--pm-danger-bg)]` (using `--pm-danger`/`--pm-danger-bg`), message "Couldn't load notifications", and a `Button variant="secondary" size="sm"` "Try again" that re-invokes `fetchAll`. A failed `markOneRead`/`markAllRead` no longer fails silently — it surfaces a `Toast` (error variant) so users know unread state may be stale.
- **Unauthenticated:** the route (`notifications/page.tsx`) already `redirect('/login')` when there is no session. No unauthenticated state is rendered on the page itself. The bell is only mounted when `profile` is present in `Header`, so it never renders for logged-out users. **GDPR note (login-relevant only):** the realtime Supabase client (`createBrowserClient`) uses the anon key and cookieless Postgres-changes filter `user_id=eq.{userId}`; no new cookies are set by this screen, and the unread count is derived server-side from the session-scoped `GET /api/v1/notifications` route. No consent banner implication beyond what `/login` already handles. Notifications content is user-scoped PII-ish (actor usernames) and is never passed to PostHog from this screen — `trackEvent` is not called here.
- **Unread badge (bell):** `count > 0` renders the pill; `count > 99` renders `99+`. `count === 0` renders no pill and the `aria-label` reads "Notifications, 0 unread". The sr-only `aria-live="polite"` region updates the count text on every change (current behavior, kept).
- **Realtime insert:** on `onInsert`, the page prepends the new notification and the bell prepends + increments count. If the channel errors, the global `RealtimeStatusDot` flips to `bg-error` ("Live updates disconnected"); the bell's own sr-only region is the count, not channel state, so no duplication.

### Pool-safe fetching

This is the hard constraint and the spec is explicit about it.

- **List fetch is a single bounded query.** `GET /api/v1/notifications?limit=50` calls `listNotifications`, which is **one** `findMany` against the `notifications` table filtered by `userId` (+ optional `unreadOnly`) ordered by `createdAt desc`, `limit ≤ 50` (schema caps at 50). No joins, no fan-out. This is the entire request path for the page's first paint and is well within the ≤3-concurrent budget — it is a wave of 1.
- **No wide Promise.all on the client.** The current `NotificationsPage` does a single `fetch` then subscribes; it must not be refactored to fan out per-type counts or per-actor profile lookups in parallel. If per-type counts are wanted for the filter chips' badge counts, they must be **derived client-side from the already-fetched list** (a `useMemo` group-by `type` over `items`), not fetched as 8 separate API calls.
- **"Load older" is a trailing/deferred query.** Older pages (beyond the initial 50) are fetched on an explicit user click of a "Load older" `Button variant="ghost"`, as a single `fetch` with a `before` cursor (or `offset`). It is never auto-fired, and it is a wave of 1. Do not prefetch older pages on mount.
- **Mark-as-read is bounded.** `markOneRead` is a single `PATCH` with one `id`; `markAllRead` is a single `PATCH` (server-side bulk `UPDATE … WHERE userId AND readAt IS NULL`). Both are wave-of-1 writes. Do not loop `markOneRead` per row to implement "mark all read".
- **Bell fetch is the same single query, unread-only.** `fetchUnread` uses `?unreadOnly=true&limit=50` — same single `findMany`, wave of 1. The bell and the page each maintain their own subscription via `createRealtimeClient()`; this is acceptable because the subscription is a Supabase Realtime channel, not a DB connection — it does not draw from the small Postgres pool.
- **Actor enrichment is deferred.** If a rebuild wants to show actor avatars/usernames inline, the actor info must come from the already-stored `payload.actorUsername`/`payload.actorSlug` (present in `notificationPayloadSchema`), **not** from a per-row `GET /api/v1/users/{slug}` fan-out. A per-row fetch would be exactly the wide-fan-out pattern that starved the pool on 2026-08-02. If a richer actor object is truly needed, it must be a single trailing batch call (`?ids=…`) after the list resolves — and even then, prefer using the payload fields already denormalized at insert time.

### Responsive behavior

- **Mobile (<lg, default):** page container is full-width with the shell's outer `px-4`. The title row stacks: `Notifications` h1 (`text-2xl font-serif font-semibold`) on its own line, the `N unread` subline beneath (`text-sm text-[var(--pm-muted)]`), and the `Mark all read` button wraps to a full-width `Button variant="secondary"` beneath the title when unread > 0. Filter chips row becomes horizontally scrollable (`overflow-x-auto` with `flex-nowrap`, chips keep `whitespace-nowrap`); the active chip's coral tint signals selection without needing a visible scrollbar. Rows are full-width; the `Mark read` per-row button stays inline (gap-4) down to ~360px, below which it wraps below the body text (the row uses `flex flex-col sm:flex-row sm:items-start sm:justify-between`).
- **≥lg:** page container `max-w-3xl` centered. Title row is `flex items-center justify-between` with the title block left and `Mark all read` right. Filter chips wrap to a second line (no horizontal scroll). Rows are the canonical layout: body Link `flex-1` + `Mark read` ghost button right.
- **Header bell dropdown:** `w-80` (320px) anchored `right-0 top-full`, `mt-2`. On narrow viewports (<360px) it should clamp to `right-2 left-2` (`w-auto`) so it never overflows the viewport; this is a minor responsive guard the current code omits and the rebuild should add. The dropdown list is `max-h-80 overflow-y-auto` (kept).

### Accessibility

- **Focus management (bell dropdown):** the current bell toggles `open` on click but does **not** trap focus or move focus into the dropdown on open, and clicking outside does not close it. The rebuild must: (a) close on outside-pointer-down and `Escape`; (b) move focus to the first list link on open and return focus to the bell button on close; (c) keep `aria-expanded` and `aria-haspopup="true"` (already present). The dropdown list links should be reachable by `Tab` in DOM order (they are, as `Link`s) — do not convert to a `role="menu"` (menu semantics impose arrow-key navigation and a parent-menu model that does not fit a flat link list).
- **Live regions:** the bell's `aria-live="polite" aria-atomic="true"` sr-only region announcing "Notifications, N unread" is retained (existing). The global `RealtimeStatusDot` (also `aria-live="polite"`) covers channel health — do not add a second one. The page itself does not need an `aria-live` region for list mutations; the count subline is a normal text node and the polite bell region is the single announcement channel.
- **List semantics:** the page renders `<ul role="list">` of `<li>` (kept). Each row body is a `Link` with an accessible name equal to `notificationText(n)` plus the timestamp; the per-row `Mark read` button has `aria-label="Mark this notification as read"` (current code has bare "Mark read" text — acceptable, but add `aria-label` when the row also links, so screen-reader users hear the distinction between "open" and "mark read" actions).
- **Keyboard flow (page):** `Tab` moves through filter chips (each `Chip` is a real `<button aria-pressed>`), then into the list rows. Each row is a single focusable `Link`; the `Mark read` button is the next focus stop after the row. `Enter` on a row follows the link (and optimistically marks read). The "Mark all read" and "Load older" buttons are normal buttons in tab order. No arrow-key navigation is imposed on the list (it is a list, not a menu or grid).
- **Color contrast:** unread rows use `bg-[var(--pm-coral-tint-10)]` (coral @ 10% over paper) with `text-[var(--pm-ink)]` (#1c1c1c) — contrast ratio ≫ 4.5:1. The unread dot in the bell dropdown is `bg-primary` (coral #d97757) on `bg-[var(--pm-paper-inset)]` (#fbfaf6); coral-on-paper is the one spot to watch — the dot is decorative (`aria-hidden`), and the text next to it is `text-[var(--pm-muted)]` (#6f665a) which meets AA for small text. The badge count pill is `bg-[var(--pm-danger)]` (#8f3324) with `text-[var(--pm-on-ink)]` (#f4efe7) — high contrast, fine. Filter chip active state is `text-[var(--pm-coral-dark)]` (#a1482a) on `bg-[var(--pm-coral-tint)]` — meets AA.
- **Motion:** the `animate-pulse` on the connecting dot and loading skeleton should respect `@media (prefers-reduced-motion: reduce)` (disable `animate-pulse`). The realtime insert prepends without animation by default; a subtle `slide-in` is acceptable only behind the same reduced-motion guard.

### Rebuild Checklist

1. **Route guard (unchanged):** `app/(community)/notifications/page.tsx` keeps `getSession()` → `redirect('/login')` if no `session.user.id`, then renders `<NotificationsPage currentUserId={session.user.id} />`. Server component, no DB query needed here (auth only).
2. **Page container:** `mx-auto max-w-3xl`; title row `mb-4 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between`. h1 `font-serif text-2xl font-semibold text-[var(--pm-ink)]` (matches the devcard h1 family/size). Subline `text-sm text-[var(--pm-muted)]` showing `{unreadCount} unread` only when > 0. Hairline divider `h-px bg-[var(--pm-line)]` below the title row.
3. **Filter bar (new):** `NotificationsFilterBar` renders `Chip`s for All / Unread / Mentions / Invites / Badges. Single `filter` state; Unread refetches with `?unreadOnly=true`; type chips client-filter `items` by `n.type`. Per-type counts derived via `useMemo` group-by over `items` — **no extra fetches**.
4. **Data fetch (pool-safe):** single `fetch('/api/v1/notifications?limit=50')` on mount; `loading`/`error`/`items` state. On non-OK, render error `Card` (`border-[var(--pm-danger)]/30 bg-[var(--pm-danger-bg)]`) with Try-again button. Do not introduce any parallel per-row or per-type fetches.
5. **Realtime (unchanged mechanism):** `subscribeToUserNotifications(currentUserId, { onInsert })` via `createRealtimeClient()`. On insert, prepend to `items`; the bell does the same and bumps count. Rely on the global `RealtimeStatusDot` for channel health — do not render a second dot.
6. **Grouping (new):** client-side bucket `items` into Today / This week / Earlier by `n.createdAt` (same calendar day, same ISO week, else earlier) using a `useMemo`. Render `NotificationGroupHeader` (serif eyebrow) + a `<ul role="list">` per bucket. No server round-trip.
7. **Row (new component):** `NotificationRow` `<li>` with `rounded-xl border p-4` + unread/read border/bg swap (coral tint vs paper-inset, per spec). Body is a `Link` to `notificationHref(n)`; `onClick` optimistically calls `markOneRead(n.id)` when `!n.readAt`. Optional `Badge` type-tag on the right under the timestamp (variant by type). Per-row `Mark read` ghost button only when unread; add `aria-label`.
8. **Mark-as-read:** `markOneRead` (PATCH with `{id}`) and `markAllRead` (PATCH with `{}`) kept; on failure, surface a `Toast` (error) instead of silent drop. `Mark all read` page button is `Button variant="secondary" size="sm"`, shown only when `items.some(n => !n.readAt)`.
9. **Empty / loading / error states:** per States section — skeleton rows while loading; empty `Card` with serif headline + muted subline; error `Card` with Try-again. All three use existing `--pm-*` tokens and the `Card`/`Card`-bordered-inset pattern.
10. **Load older (new, deferred):** `Button variant="ghost"` "Load older" beneath the list; on click, single trailing `fetch` with `before` cursor (or `offset`). Wave-of-1, user-initiated only.
11. **Bell dropdown hardening:** keep `NotificationBell` shape; add outside-click + `Escape` close, focus into first link on open, return focus to bell on close, clamp dropdown width on `<360px`. Switch `shadow-lg` → `shadow-[var(--pm-shadow-lg)]` for token alignment with `UserDropdown`. Keep the `bg-[var(--pm-danger)]` count pill and `99+` cap. Keep `aria-live` count region.
12. **Responsive:** implement the mobile/`≥lg` rules in §Responsive — stacked title on mobile, scrollable chip row on mobile, wrapping on `≥lg`, row `Mark read` wrap below 360px.
13. **Accessibility:** add `aria-label` to per-row `Mark read`; ensure `prefers-reduced-motion` disables `animate-pulse`; keep `role="list"` on all `<ul>`s; keep bell `aria-expanded`/`aria-haspopup`.
14. **No new tokens:** every color resolves to an existing `--pm-*` variable or its Tailwind utility (`bg-primary`, `bg-error`, `text-success`, `bg-[var(--pm-coral-tint-10)]`, etc.). No ad-hoc hex values.
15. **GDPR/scope check:** confirm no `trackEvent`/`identifyAnalytics` calls are added on this screen; realtime uses anon-key cookieless channel; no new cookies. PII (actor usernames) stays in-app and is not exfiltrated to analytics.

---

## Settings

### Purpose
Self-service account screen for the signed-in operator. In one scrollable column the user can: upload/replace an avatar (T8.6 → `POST /api/v1/me/avatar` pre-signed PUT flow), edit their display name, toggle notification/digest/accessibility/newsletter preferences (written to the `users.preferences` jsonb via `PATCH /api/v1/me`), review and leave circles they belong to, and sign out. EU-hosted (GDPR): the screen doubles as the consent hub for email-channel preferences (notifications, weekly digest, newsletter) and is the natural entry point for data-export / account-deletion affordances — all cookieless, no tracking SDKs load on this route.

### Layout
Single centered column, `max-w-2xl` (matches devcard), sitting inside the global shell (sticky `Header` + `ToastProvider` from `layout.tsx`). Page H1 + four stacked `Card`s, each `Card` separated by `mb-6` (`--pm-space-6`). The existing route already fetches a 2-wide `Promise.all` of `[user, memberships]` — this is within the ≤3 pool budget; no redesign of the fetch shape is required, only its visual surface.

```
┌────────────────────────────────  max-w-2xl  ────────────────────────────────┐
│  Settings                                                          [H1 serif]│
│                                                                            │
│  ┌─ Card: Identity ──────────────────────────────────────────────────────┐ │
│  │  [Avatar lg]  Full name                                                │ │
│  │              @userslug · email · role badge                            │ │
│  │  ───────  (hairline --pm-line)                                         │ │
│  │  Change avatar   [▾ Choose file…]   [Upload]      Uploading…           │ │
│  │  hint: JPEG/PNG/WebP, ≤2 MB                                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌─ Card: Profile ───────────────────────────────────────────────────────┐ │
│  │  Profile                                                    [H2 serif]│ │
│  │  Display name   [Input: fullName]                                       │ │
│  │  Username       @userslug        (read-only, set at signup)            │ │
│  │  Email          email            (read-only → "Change email" deferred) │ │
│  │                                                                        │ │
│  │  ┌─ Preferences (fieldset) ─────────────────────────────────────────┐ │ │
│  │  │  Email notifications       [toggle row]  off ●  on                │ │ │
│  │  │  Weekly digest             [toggle row]  off ●  on                │ │ │
│  │  │  Newsletter                [toggle row]  off ●  on                │ │ │
│  │  │  ── Reduced motion         [toggle row]  off ●  on  (accessibility)│ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │  [Saved ✓ / error msg]                              [Save profile →] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌─ Card: Your circles ──────────────────────────────────────────────────┐ │
│  │  Your circles                                              [H2 serif]│ │
│  │  ● Circle name   [Badge outline: role]                  [Leave]        │ │
│  │  ● Circle name   [Badge outline: role]                  [Leave]        │ │
│  │  (empty state: "You haven't joined any circles yet. Browse circles →") │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌─ Card: Account & data  (GDPR) ─────────────────────────────────────────┐ │
│  │  Account & data                                             [H2 serif]│ │
│  │  Danger zone  (inset block, --pm-danger-bg / --pm-line)                │ │
│  │  · Export my data  [Button secondary]  → deferred job (T8.x)            │ │
│  │  · Delete account  [Button danger]  → ConfirmDialog                     │ │
│  │  ───────                                                               │ │
│  │  [Sign out  →]   (ghost, right-aligned, LogOut icon)                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Components

**Reused (do not redesign):**
- `Card` — each section wrapper; the package default `rounded-xl border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]` is the exact card surface. Override `p-5` → `p-6` (`--pm-space-6`) to match the existing settings cards and the profile/devcard padding rhythm.
- `CardHeader` / `CardTitle` / `CardDescription` — use inside each Card for the H2 serif title + one-line description, replacing the current bare `<h2 className="text-lg font-medium">` so headings read as `font-serif` (per `globals.css` h2 rule) and carry consistent spacing.
- `Avatar` (`size="lg"`, with `badge={<LevelBadge level={n} size="xs"/>}` to match the Header dropdown treatment) — identity preview.
- `Input` — display-name field. Its built-in `label` / `error` / `description` props replace the hand-rolled `<label>`; `description` carries the "Visible on your profile and comments" hint, `error` carries validation messages.
- `Button` — `variant="primary"` (Save), `variant="secondary"` (Leave, Export, Sign out secondary), `variant="danger"` (Delete account), `variant="ghost"` (Sign out, right-aligned with `<LogOut/>`). All sizes `md`/`sm` as today.
- `Badge` (`variant="outline"`) — role chip next to each circle (current pattern preserved).
- `ConfirmDialog` — "Leave this circle?" (destructive, current) **and** a new second instance for "Delete account?" (destructive, confirm label "Delete permanently").
- `Toast` / `useToast` — avatar upload success/failure, preference save failure, leave/delete outcomes. Replaces the current bare `<p>{message}</p>` status line for errors; keep a compact inline "Saved ✓" status for the profile save confirmation.
- `LevelBadge` — only if we surface the level on the identity card (optional; matches Header dropdown).

**New (small, screen-local):**
- `PreferenceToggle` — replaces the current `PreferenceRow` raw `<input type="checkbox">`. A labeled switch row: left-aligned label + description, right-aligned Radix-style toggle (or styled checkbox `h-5 w-5 rounded-[var(--pm-radius-sm)] border-[var(--pm-line-2)]`, checked fill `bg-[var(--pm-coral)] border-[var(--pm-coral-dark)]`, check glyph in `--pm-on-ink`). Wrap the four toggles in a `<fieldset>` with a `<legend>` so the group is announced as "Preferences". *Rationale:* the package has no `Checkbox`/`Switch` primitive (confirmed: no `Checkbox.tsx` in `packages/ui/src/components/`), so this is a screen-local component, not a redesign of a shared one. It can be promoted to the package later.
- `DangerZone` — inset block: `rounded-[var(--pm-radius-lg)] border border-[var(--pm-line-2)] bg-[var(--pm-danger-bg)]/40 p-4`, containing the Export + Delete buttons with explanatory copy. Keeps destructive affordances visually quarantined from the identity/profile cards.
- `DataExportButton` (deferred) — placeholder button that links to a future `/settings/export` job (T8.x). Ship disabled with a `title="Coming soon"` tooltip so the GDPR affordance is visible at launch without implying a working endpoint.

**Avatar upload — keep the existing two-step flow (T8.6):**
1. `POST /api/v1/me/avatar` with `{ contentType, sizeBytes }` → returns `{ uploadUrl }`.
2. Browser `PUT uploadUrl` with the raw file.
3. On success: `toast({title:'Avatar updated', variant:'success'})` + `window.location.reload()` (current behavior; acceptable — the avatar is cached in the Header and profile).

### States

| State | Treatment |
|---|---|
| **Unauthenticated** | Route guard: `getSession()` → `redirect('/login')` (already implemented in `settings/page.tsx`). No client-side fallback needed. |
| **Loading (page)** | Server component resolves the 2-query wave before render; rely on Next.js streaming/Suspense at the `max-w-2xl` shell if a loading skeleton is desired: a single `Card` with `animate-pulse` bars at `bg-[var(--pm-paper-2)]`. |
| **Loading (avatar upload)** | `uploading` state: disable the file input + show inline `Uploading…` in `--pm-muted`; keep the `Avatar` mounted (no skeleton). On 4xx (wrong type/size), `toast({variant:'error'})` with the server message; do **not** reload. |
| **Loading (profile save)** | `saving` state: `Button disabled` → "Saving…"; show inline `Saved ✓` in `--pm-green` for 2s on success, then revert. On error, `toast({variant:'error'})` + keep field values. |
| **Saving preferences** | Optimistic local state (current `useState` pattern). Toggle is disabled for ~150ms while `PATCH /api/v1/me` is in flight; on failure, revert the toggle and toast. (Optional enhancement — current "Save profile" batch submit is also acceptable and simpler; keep batch submit as the default, treat per-toggle autosave as a future enhancement.) |
| **Error (avatar PUT)** | Toast error; input re-enabled; no reload. |
| **Error (profile PATCH)** | Inline `--pm-danger` text under the form + toast. |
| **Leave circle** | `ConfirmDialog` (destructive) → `DELETE /api/v1/groups/{slug}/membership` → reload. On error, toast + close dialog. |
| **Delete account** | `ConfirmDialog` (destructive) with description explaining irreversibility and that posts/comments remain (anonymized) per GDPR retention. Disabled/hidden at launch if the endpoint isn't wired — then it shows the "Coming soon" tooltip instead. |
| **Empty circles** | Replace the `<ul>` with: `text-[var(--pm-muted)]` paragraph "You haven't joined any circles yet." + a `Button variant="ghost"` link → `/feed` "Browse circles". |
| **Reduced motion on** | When `preferences.reducedMotion` is true, the toggle itself and any future micro-animations on this screen omit transitions (`transition-none`). Stored in `preferences` jsonb so it persists server-side and can be read by other routes. |

### Responsive behavior

- **Mobile (< `lg`, single column):** `max-w-2xl` column becomes full-width with the shell's horizontal padding. Identity card: stack avatar above name/email (`flex-col`); avatar left-aligns. Preference toggles: label stacks above the switch if viewport < 360px (`flex-col` on the `PreferenceToggle` row). Circle rows: name truncates (`min-w-0 truncate`), `Leave` button stays right. Danger zone: buttons stack full-width. The Header already collapses nav into a hamburger at `md` — no settings-specific nav needed.
- **≥ `lg`:** Identity card uses `flex-row items-center gap-4` (current). Circles row is `flex items-center justify-between`. Danger-zone buttons sit inline. No right-rail — settings is a focused single-column flow, intentionally narrower than the profile page's `max-w-6xl` to signal "account task" not "content browsing".
- **Print:** not a target; no print styles required.

### Accessibility

- **Headings:** one `h1` ("Settings", serif) then one `h2` per card ("Profile", "Your circles", "Account & data"). Use `CardTitle` (renders a heading element) so the outline is navigable.
- **Focus management:** the global `--pm-focus` ring (`0 0 0 2px var(--pm-paper), 0 0 0 4px var(--pm-coral)`) is already applied by `Button` and `Input`. The file input and the new `PreferenceToggle` must adopt the same `focus-visible:shadow-[var(--pm-focus)]` — the native file input's `file:` pseudo-element button needs an explicit focus ring wrapper since `file::file-selector-button` focus is inconsistent across browsers; wrap the input in a focusable `<label>` that shows the ring.
- **Toggles:** each `PreferenceToggle` is a `<label>` wrapping the input → the whole row is the click target. Give the input `role="switch"` (via `type="checkbox"` + `aria-checked` is implicit; if styled as a switch, set `role="switch"` explicitly) and an `aria-label` equal to the preference name. Associate the description via `aria-describedby`.
- **Fieldset/legend:** the four toggles sit in a `<fieldset>` with `<legend class="sr-only">Preferences</legend>` so screen readers announce the group.
- **Read-only fields:** username and email are read-only `Input` with `aria-readonly`; the email row links to a deferred "Change email" flow (not enabled at launch → render as plain text + a ghost "Coming soon" button, not a disabled input, to avoid implying an editable field).
- **Confirm dialogs:** `ConfirmDialog` already uses Radix Dialog — focus traps, Escape to cancel, and `aria-labelledby`/`aria-describedby` are inherited. Confirm button gets `aria-label` = `confirmLabel` (already).
- **Color contrast:** `--pm-ink` on `--pm-paper-inset` (~16:1), `--pm-muted` (#6f665a) on `--pm-paper` meets AA for body text. `--pm-coral` (#d97757) on `--pm-on-ink`/paper is used only for accents/checked-state fills and the check glyph sits on `--pm-on-ink` (#f4efe7) inside the checked toggle — AA pass. The danger zone uses `--pm-danger` (#8f3324) text on `--pm-danger-bg` (#f3ddd6) — AA pass for large text; body copy there uses `--pm-ink` to be safe.
- **Keyboard flow:** Tab order: Identity (avatar file input) → Display name → toggles (4) → Save → circles (each row: link, Leave) → Export → Delete → Sign out. Shift+Tab reverses. Enter submits the profile form; Space toggles the focused switch.
- **GDPR / consent:** toggling any of Email notifications / Weekly digest / Newsletter off must suppress the corresponding email channel server-side (the `preferences` jsonb is the source of truth read by the digest/loops/notification jobs). Render a one-line consent reminder under the fieldset: "You can withdraw email consent at any time; changes take effect on the next send." No cookie banners here — the portal is cookieless for analytics and PostHog is only loaded via `PostHogProvider` for identified events, not for ad tracking.

### Data-fetch budget (≤3 concurrent queries)

The current `settings/page.tsx` issues a **2-wide wave** (`Promise.all([users.findFirst, getUserMembershipGroups])`) — already compliant. The redesign must not widen this:

1. **Wave 1 (≤2 concurrent):** `users.findFirst({id})` + `getUserMembershipGroups(db, userId)`. These are the only two reads needed to paint every section above the fold.
2. **Deferred / trailing (1 query, not on initial paint):** `getAvatarReadUrl(user.pictureUrl)` is a URL-sign, not a DB query — safe to keep inline (as today). Do **not** add a third read for "export status" or "recent sessions" on this path; if a data-export job status is shown later, fetch it client-side after mount via a separate `GET /api/v1/me/export` so it never counts against the server-render pool budget.
3. **Writes (no fan-out):** avatar upload is two HTTP hops (no DB query from the page); `PATCH /api/v1/me` is a single row update; `DELETE /api/v1/groups/{slug}/membership` is a single row delete. None of these widen the read pool. Keep the sign-out path (`auth.signOut`) entirely on the auth client — no DB query.

**Rule of thumb for the rebuild:** if a future feature tempts a third concurrent read on this route (e.g. "recent login history", "active sessions"), push it to a client-side `useEffect` fetch *after* hydration, or behind a tab — never into the server `Promise.all`. The 2026-08-02 pool-starvation incident was caused by exactly this kind of innocent-looking third/fourth fan-out.

### Rebuild checklist

- [ ] `settings/page.tsx`: keep the existing 2-wave `Promise.all`; do not add a third read. Pass `role` and a resolved `avatarUrl` into `SettingsPage`.
- [ ] `SettingsPage.tsx`: swap the bare `<h1 className="text-2xl font-semibold">` for `font-serif` H1 (h1 rule in `globals.css` already forces serif, but add explicit `text-[28px]` to match the group banner rhythm).
- [ ] Replace each bare `<h2>` with `CardHeader` + `CardTitle` + `CardDescription`.
- [ ] Identity card: add `LevelBadge` to the `Avatar` (size `xs`) to match Header; add a hairline divider (`border-t border-[var(--pm-line)]`) between the avatar row and the upload row.
- [ ] Avatar upload: keep the `POST /api/v1/me/avatar` → `PUT uploadUrl` flow; add `accept="image/jpeg,image/png,image/webp"`, a client-side `sizeBytes <= 2_097_152` guard with a toast, and an accessible focus ring on the file `<label>`.
- [ ] Profile form: use `Input` with `label`, `description`, `error` props instead of manual `<label>`; render username + email as read-only rows (plain text + ghost "Coming soon" link, not disabled inputs).
- [ ] Build `PreferenceToggle` (screen-local): labeled switch row in a `<fieldset>`/`<legend>`, four toggles (emailNotifications, weeklyDigest, newsletter, reducedMotion), `role="switch"`, `aria-describedby`, focus ring `--pm-focus`. Move reduced-motion visually last with a divider + "Accessibility" sub-label.
- [ ] Add a GDPR consent reminder line under the preferences fieldset; ensure the three email-channel toggles are read by the digest/loops/notification jobs from `preferences` jsonb.
- [ ] Circles card: preserve current list; add the empty-state "Browse circles" ghost link.
- [ ] Add `Account & data` card with `DangerZone` inset: Export (secondary, deferred/coming-soon) + Delete account (danger, behind `ConfirmDialog`). Sign-out button moves into this card (ghost, right-aligned, `<LogOut/>`), keeping the existing `createAuthClient().auth.signOut()` flow.
- [ ] Replace inline `<p>{message}</p>` status with: success → compact `Saved ✓` in `--pm-green` for 2s; error → `toast({variant:'error'})` + inline `--pm-danger` text.
- [ ] Confirm `ToastProvider` wraps the route (it does, via `layout.tsx`) — `useToast()` will resolve.
- [ ] Mobile: verify the `PreferenceToggle` stacks label-above-switch at < 360px; verify circle rows truncate and `Leave` stays reachable.
- [ ] Audit focus order with keyboard; confirm Radix `ConfirmDialog` focus trap works for both Leave and Delete dialogs.
- [ ] No new `--pm-*` tokens and no new shared components — only `PreferenceToggle`, `DangerZone`, and `DataExportButton` are new, all screen-local.

---

## Moderation queue

### Purpose

A single workspace for moderators and admins to triage user reports and auto-flags on posts and comments across all circles. Surfaces each flag with reason, reporter (or "Auto-flagged"), the flagged content in context, and the actions **Dismiss**, **Hide content** (resolve), and **Delete flag**. Replaces the current bare list (`components/ModerationQueue.tsx`) with a Paper v3 panel that matches the WS6 group/profile/banner aesthetic and fixes the broken comment-target **View** link.

The same `ModerationQueue` client component is mounted at two routes with two role scopes:
- `/moderation` — community entry, inline server guard in `app/(community)/moderation/page.tsx` (redirects non-logged-in to `/login?returnUrl=/moderation`, non-moderators to `/feed`). Surfaced via the Header user-dropdown `Moderation` item and the mobile menu (already gated by `isModeratorOrAdmin(profile.role)`).
- `/admin/moderation` — admin entry, `app/admin/moderation/page.tsx` renders `<ModerationQueue />` unguarded here and relies on the `(admin)` layout's site-admin guard. Admins additionally see a per-flag **Escalate** action (see Actions).

### Layout

Paper v3 single-column workbench inside the existing shell (sticky `Header`, `max-w-6xl` rail). Container `mx-auto max-w-5xl px-4 py-6`, matching the community route's existing wrapper.

```
┌───────────────────────────────────────────────────────────────────┐
│  Header (shell, sticky)                                            │
├───────────────────────────────────────────────────────────────────┤
│  ← Back to feed                              [role chip: Mod|Admin]│
│                                                                     │
│  Moderation queue                       ┌─────┬─────┬─────┐         │
│  Serif h1, text-[28px]                  │Open │Resv │Dism │   type │
│  Triage reports & auto-flags            └─────┴─────┴─────┘  filter │
│  muted subtitle                         [All] [Posts] [Comments]    │
│                                                                     │
│  ┌──StatCard──┐ ┌──StatCard──┐ ┌──StatCard──┐ ┌──StatCard──┐       │
│  │  12  Open  │ │  4  Resv   │ │  2  Dism   │ │ 3  Auto-   │       │
│  │            │ │            │ │            │ │ flagged    │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│                                                                     │
│  ┌─ Resolution note (applied to next action) ──────────────────┐   │
│  │ Input, label as above, placeholder "Reason for resolution"   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Queue list (vertical stack of Cards, gap-4)                        │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ POST · circle:ai-operators        [Badge: open]  [Auto-flag]   │ │
│  │ CardTitle (serif): "How do I…" in circle link (coral)          │ │
│  │ muted row: Reason: spam · Auto-flagged · author @user link     │ │
│  │ paper-inset excerpt box (hairline border, rounded-lg)          │ │
│  │ reporter line (muted): reported by @reporter · 2h ago          │ │
│  │ [View →] [Dismiss] [Hide content] [Escalate*] [Delete flag]    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌─ COMMENT · circle:…  (same structure, excerpt = comment body) ┐ │
│  │ … View → lands on parent post, anchored to this comment        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [Load more] (when hasMore)                                         │
└───────────────────────────────────────────────────────────────────┘
```

### Components

**Reused (do not redesign):**
- `Card` / `CardHeader` / `CardTitle` / `CardContent` — each flag row.
- `Button` — actions, `variant="secondary" | "danger" | "ghost"`, `size="sm"`. `View` uses `asChild` wrapping a Next `<Link>` (see bug fix).
- `Input` — resolution-note field (keeps `label`, `placeholder`).
- `Badge` — status pill per row: `open` → `amber`, `resolved` → `green`, `dismissed` → `outline`. Auto-flag tag uses `Badge variant="coral"`.
- `StatCard` — the 4-up summary row (Open / Resolved / Dismissed / Auto-flagged), each with `icon` (lucide `Shield`/`CheckCircle`/`EyeOff`/`Bot`) tinted `text-[var(--pm-coral)]`.
- `Chip` — status filter (Open/Resolved/Dismissed) and type filter (All/Posts/Comments). `aria-pressed` already wired.
- `ConfirmDialog` — destructive confirm for **Delete flag** (already used; keep `destructive` + `confirmLabel="Delete"`).
- `Toast` (`useToast`) — error feedback for PATCH/DELETE failures (already used, `variant="error"`).
- `Avatar` — optional reporter avatar in the reporter row when reporter is a user (size `sm`).

**New / changed:**
- **Page banner** — a `rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-6 shadow-[var(--pm-shadow)]` header band mirroring the group-page banner: serif `h1` "Moderation queue" (`font-serif text-[28px] font-semibold text-[var(--pm-ink)]`), muted subtitle, and a right-aligned role chip (`Badge variant="outline"`: "Moderator" or "Admin") so the viewer always sees their own scope. Replaces the current unstyled `<h1 className="text-2xl font-semibold">`.
- **Back link** — `<Link href="/feed">← Back to feed</Link>` in `text-sm text-[var(--pm-muted)]`, matching the devcard back-link pattern.
- **Escalate action (admin only)** — extra `Button variant="ghost" size="sm"` shown when the session role is `admin`. Escalating sets `status: 'resolved'` with a `resolutionNote` prefixed `ESCALATED: ` and is the only action that leaves the underlying content visible (a moderator does not get this button). Role is passed into the component from the server guard (see Data fetching).
- **Comment-target View link fix** — see Bug callout below; requires the API to return the parent post id on comment targets.

### States

- **Loading** — while `loading && flags.length === 0`: render 3 skeleton Cards (`animate-pulse` blocks: `bg-[var(--pm-paper-2)] rounded-lg` with `h-4`/`h-16` inner blocks). Do not render the muted "Loading..." text only.
- **Empty** — when `flags.length === 0 && !loading`: a `Card` with a centered empty state — muted lucide `ShieldCheck` icon, `font-serif text-lg` "Nothing to review", `text-sm text-[var(--pm-muted)]` subline naming the active filter ("No open flags." / "No resolved flags." / "No dismissed flags."). Empty state must reflect both status *and* type filter (e.g. "No open flags for comments.").
- **Error** — when `error`: a `Card` with `border-[var(--pm-danger)] bg-[var(--pm-danger-bg)]` banner row containing the message in `text-[var(--pm-danger)]` plus a `Button variant="secondary" size="sm"` "Retry" that calls `load()`. Replaces the current bare `<p>` above the list.
- **Unauthenticated / unauthorized** — handled server-side (see Data fetching); this component never renders for non-moderators. If the `/api/v1/moderation/queue` call returns 403 (e.g. role changed mid-session), show the error banner with "You no longer have moderator access." and a link back to `/feed`.
- **Missing target** — the API already returns a sentinel `target` for deleted posts/comments; render the Card with a muted "This content was deleted" line in place of the excerpt, and disable Dismiss/Hide, keep only **Delete flag**.
- **Action pending** — disable the clicked button (`disabled:opacity-60` is already on `Button`) and show a per-row spinner label ("Hiding…") to prevent double-submit.

### Responsive behavior

- **≥lg (desktop):** banner is a single row (title left, role chip + filters right); StatCard row is `grid grid-cols-4 gap-3`; filter chips sit inline on the banner's right. Action buttons wrap in a `flex flex-wrap gap-2` row.
- **<lg (mobile/tablet):** banner stacks (`flex-col`); StatCard row becomes `grid-cols-2 gap-3`; status and type filters wrap to their own row below the title, full-width `Chip` group with `flex-wrap`. Card action buttons remain `flex-wrap` so **View / Dismiss / Hide content** never overflow. Container `px-4` is preserved (already mobile-safe). Excerpt box uses `text-sm` and `max-h-40 overflow-y-auto` so long posts don't dominate a small screen.

### Accessibility

- **Focus management:** filter `Chip`s are real `<button aria-pressed>` (already), keyboard toggles status; after a successful action, move focus to the next flag's **View** button (or the empty-state heading if the list becomes empty) — never leave focus on a removed node. ConfirmDialog manages its own focus trap (Radix Dialog).
- **Roles/labels:** the queue list is `<ul role="list">` of `<li>` Cards; each Card's `CardTitle` is an `<h3>` (semantic, serif). StatCards get `aria-label` ("12 open flags"). The resolution-note `Input` keeps its `label`. The **View** link's accessible name must include the target type ("View post in ai-operators" / "View comment in ai-operators") — today it reads only "View".
- **Keyboard flow:** Tab order: back link → status chips → type chips → StatCards (tabindex 0 or wrapped in links) → note input → first card's actions → next card. Enter/Space activates buttons and chips (native). Esc closes ConfirmDialog.
- **Color contrast:** status badges meet AA: `amber` badge text `--pm-amber (#7a4d18)` on `--pm-amber-bg (#f1e4cf)` ≥ 4.5:1; `green` `--pm-green (#3a6447)` on `--pm-green-bg`; `outline` uses `--pm-ink` on `--pm-paper`. Auto-flag `coral` badge text `--pm-coral-dark (#a1482a)` on `--pm-coral-tint` — verified contrast. Error banner `--pm-danger` text on `--pm-danger-bg` is AA. Never convey status by color alone — the Badge label text is always present.
- **GDPR:** no new cookies. The resolution note is free-text entered by the moderator — keep it to internal operational content; do not prefill with reporter PII. No analytics events on individual flag contents (only aggregate: `moderation_action_taken` with `{status, type, resolution}` is acceptable).

### Data fetching & DB-pool budget (≤3 concurrent)

The current `/api/v1/moderation/queue` route calls `listModerationQueue`, which runs one `flags.findMany` query, then a **sequential per-flag `resolveFlagTarget`** in a `for` loop (one query per flag). Sequential is pool-safe (it never widens) but slow at 20 rows. The redesign must keep the pool bound and must NOT replace the loop with a wide `Promise.all` over flags (the 2026-08-02 pool-starvation incident was exactly that pattern).

Prescribed fetch plan, server-side, in bounded waves:
1. **Wave 0 (gate, 1 query):** `isGlobalModerator(userId)` — single `users.findFirst`. Non-moderator → `Forbidden`. (Existing.)
2. **Wave 1 (1 query):** `flags.findMany` with `status` filter, `limit+1`, `offset`, `orderBy createdAt desc`.
3. **Wave 2 (≤2 concurrent, batched):** split the page's flags into posts and comments. Run **two batched joins** — one `posts ⨝ users ⨝ groups where posts.id IN (...)` and one `comments ⨝ posts ⨝ users ⨝ groups where comments.id IN (...)` — using `inArray`. That is ≤2 concurrent queries (≤3 budget) and collapses the N+1 into two queries regardless of page size. Map results back onto flags in memory.
4. **Wave 3 (trailing, deferred, 1 query):** the **counts for the StatCard row** (open/resolved/dismissed/autoflagged totals). Run as a single grouped `count(*)` query *after* the list renders, or defer it to a second client request (`/api/v1/moderation/counts`) so the queue list paints first. Do not bundle counts into the same wave as the list — it's a separate concern and a trailing query is the correct pattern (mirrors the group page keeping `upcomingEvents` as a trailing bounded query).

Client-side: `ModerationQueue` fetches `?status=&type=&page=` from `/api/v1/moderation/queue`. Counts come from a separate `useEffect` call to `/api/v1/moderation/counts` (trailing). **No client-side fan-out.** Pagination via a **Load more** button appending the next page (one request at a time), not infinite scroll with overlapping requests.

The server guard at `/moderation` (community route) already runs 1 query (`users.findFirst` for role) — keep it. The `/admin/moderation` route relies on the `(admin)` layout guard; the redesign must confirm that layout guards role server-side (it should not rely on the client). Both routes pass `role` into `ModerationQueue` as a prop so the client can show/hide **Escalate** without a second request.

### Bug callout — comment-target **View** link (must fix in rebuild)

`components/ModerationQueue.tsx` line 126 builds the View link as:

```
href={flag.target.type === 'post' ? `/p/${flag.target.id}` : `/p/${flag.target.id}`}
```

Both branches are identical, and for a comment flag `flag.target.id` is the **comment id**, so the link points to `/p/<commentId>` — a route that does not exist (post routes expect a post id). Clicking View on a comment flag 404s (or lands on the wrong post if a post ever shared the id).

Root cause is also in the API: `resolveFlagTarget` (`apps/web/lib/services/moderation.ts`, ~line 180) sets `target.id = row.comment.id` for comments and discards the joined `row.post.id` it already has.

**Fix (spec, two parts):**
1. **API:** extend the comment branch of `resolveFlagTarget` (and the `flagTargetPreviewSchema` in `packages/api/src/contracts/flags.ts`) to include the parent post on comment targets — add `post: { id: string; slug?: string }` to `flagTargetPreviewSchema` (only populated when `type === 'comment'`). The data is already joined; this is a serialization change, not a new query.
2. **Client:** build the View href by type —
   - post → `/p/${flag.target.id}`
   - comment → `/p/${flag.target.post.id}#comment-${flag.target.id}`

   The anchor assumes the post page renders comments with `id="comment-<uuid>"`; confirm that during rebuild (if the post page uses a different anchor scheme, match it). Update the link's accessible name accordingly ("View comment in …").

Also fix the **content rendering** while here: `dangerouslySetInnerHTML` on `flag.target.content` is an XSS vector if the content is user-authored HTML. In the rebuild, render content as plain text (`whitespace-pre-wrap`) or run it through the same sanitizer the feed uses — do not inject raw HTML. The excerpt box stays `rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-sm text-[var(--pm-ink-2)]`.

### Rebuild checklist

- [ ] Banner band: `rounded-xl border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-6 shadow-[var(--pm-shadow)]`, serif `h1` "Moderation queue", muted subtitle, right-aligned role `Badge`.
- [ ] Back link `/feed` in `text-sm text-[var(--pm-muted)]` above the banner.
- [ ] Status filter: 3 `Chip` (Open/Resolved/Dismissed), `aria-pressed`, default `open`.
- [ ] Type filter: 3 `Chip` (All/Posts/Comments), `aria-pressed`, default `All`.
- [ ] StatCard row (4): Open / Resolved / Dismissed / Auto-flagged, lucide icons in `text-[var(--pm-coral)]`, `grid grid-cols-4 gap-3` → `grid-cols-2` on mobile. Data from trailing `/api/v1/moderation/counts`.
- [ ] Resolution-note `Input` (keep `label`, placeholder "Reason for resolution").
- [ ] Queue: `<ul role="list">` of `<li>` `Card`s, one per flag. `CardTitle` serif `<h3>`, circle link in `text-[var(--pm-coral)] hover:underline`.
- [ ] Per-row status `Badge` (open=amber, resolved=green, dismissed=outline) + `Badge variant="coral"` "Auto-flagged" when `autoFlagged`.
- [ ] Excerpt box: `rounded-lg border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-sm`, plain-text (no `dangerouslySetInnerHTML`).
- [ ] Reporter line: muted `text-sm text-[var(--pm-muted)]`, "reported by @reporter · {relative time}" or "Auto-flagged" when `reporterId` is null.
- [ ] **View link fix:** API returns `target.post.id` for comments; client builds `/p/${post.id}#comment-${comment.id}` for comments, `/p/${id}` for posts; accessible name "View {post|comment} in {circle}".
- [ ] Actions: `View` (secondary, `asChild`+Link), `Dismiss` (secondary → status `dismissed`), `Hide content` (danger → status `resolved`), `Escalate` (ghost, admin only, → `resolved` with `ESCALATED:` note prefix), `Delete flag` (ghost → opens `ConfirmDialog` destructive). Only render Dismiss/Hide when `flag.status === 'open'`.
- [ ] Missing-target state: "This content was deleted" + only Delete flag enabled.
- [ ] Loading: 3 skeleton Cards (`animate-pulse`, `bg-[var(--pm-paper-2)]`).
- [ ] Empty: centered `ShieldCheck` icon + serif "Nothing to review" + muted subline reflecting status+type filters.
- [ ] Error: danger-tinted banner Card (`border-[var(--pm-danger)] bg-[var(--pm-danger-bg)]`) + Retry button.
- [ ] 403 mid-session: "You no longer have moderator access." + link to `/feed`.
- [ ] **Load more** button when `hasMore` (one request at a time; no overlapping fetches).
- [ ] Server: keep the wave plan — gate → list → batched 2-join resolve (≤2 concurrent) → trailing counts. No `Promise.all` over flags. Confirm `/admin` layout guards role server-side.
- [ ] Pass `role` from both route handlers into `ModerationQueue` as a prop; derive Escalate visibility from it.
- [ ] Responsive: banner stacks <lg; StatCards `grid-cols-2 <lg`; action buttons `flex-wrap` always.
- [ ] A11y pass: list `role="list"`, `h3` titles, chip `aria-pressed`, link names include type+circle, focus moves to next flag after an action, contrast verified for amber/green/outline/coral/danger badges.

---

## Notes for the rebuild

- These are design specs, not Fidelity guarantees; the rebuild should reconcile any field/route name against the live code (`packages/api` contracts, `apps/web/lib/services/*`, `apps/web/app/(community)/*`) before wiring.
- All new pages/routes must respect the **pool-starvation rule**: ≤3 concurrent DB queries per request path, bounded sequential waves, no wide `Promise.all` of fanning-out services. The circle page (`apps/web/app/(community)/g/[slug]/page.tsx`) is the reference pattern.
- Capture `signup`, `onboarding_complete`, and `daily_visit` via the PostHog-backed `trackEvent` (T8.2) on these screens where the spec calls for it.
