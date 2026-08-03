# pm-operator session handoff — 2026-08-03

> Continuity doc for resuming the community-portal work in another session.
> Source of truth remains `docs/DESIGN-GAP-REPORT.md` § "Implementation status"
> and the project memory at `~/.claude/projects/-Users-izzy-Documents-pm-operator/memory/`.

## Resume here

The community-portal redesign (**WS1–WS9**) is **fully complete and live in production**
on `operator.promptmetrics.dev`. All workstreams shipped, migrations 0014–0018 applied,
PostHog analytics correctly wired, and the remaining interaction bugs (likes, comments,
create post, join circle) are fixed, deployed, and verified via Playwright/Chromium.

- Latest commit on `main`: `14a95e0` — `fix(auth/onboarding): redirect new sign-ins to onboarding, return JSON for API auth failures`
- Latest prod deploy: `dpl_215MtL5KJmf7o5W4b64nGrd7rLaR` / `pm-operator-97n1fa6yd` (Ready, live)
- Migrations 0014–0018 applied to the prod DB
- PostHog: `phc_` Project API key inlined in the client bundle + EU Cloud host — verified live
- Supabase `avatars` Storage bucket: private, created/verified

## This session's work (chronological)

1. **(Carried from prior session)** Applied migrations 0014–0018 to prod via an
   authorized Vercel env-pull into a tempfile + `pnpm db:migrate`, then deleted the
   tempfile (no secret logged). Pushed `bd03dba` → deploy `pm-operator-f2him2ska`.
   Smoke-tested: `/feed`, `/digest`, `/messages`→login, `/api/v1/conversations` (401),
   `/api/v1/events` (200), and circle pages (events rail) — no 500s.

2. Pushed `b20e21a` (docs record of the deploy) → deploy `pm-operator-sd8eqlhn7`.
   Created/verified the **private** `avatars` Storage bucket via the Supabase CLI
   (`supabase link` in a temp workdir + `supabase db query --linked "insert into
   storage.buckets…"`; cleaned up the temp workdir). Bucket: `public=false`,
   2 MB size limit, mime types jpeg/png/webp.

3. **PostHog misconfiguration discovered & fixed (this session's main work):**
   - Discovered the deploy's client bundle inlined a **`phx_`** (Personal API) key in
     `NEXT_PUBLIC_POSTHOG_KEY`, not a **`phc_`** (Project) key. Two consequences:
     (a) PostHog silently drops **all** events (a `phx_` token isn't a valid capture
     token); (b) the private personal key was leaked into the public JS bundle.
   - Web-searched PostHog docs to confirm key-type prefixes: `phc_` = public Project
     API key (client ingestion), `phx_` = private Personal API key (server REST only),
     `phs_` = project secret. Prefix does **not** indicate cloud vs self-hosted.
   - Confirmed the codebase has **no server-side PostHog usage** (`posthog-node` not
     installed; the weekly digest computes its hot-topic from the DB, not PostHog) —
     so a personal key has no legitimate use here at all.
   - User fixed `NEXT_PUBLIC_POSTHOG_KEY` in Vercel to the `phc_` Project key.
   - Committed `34095cd` (a doc-note in `PostHogProvider.tsx` documenting the `phc_`
     requirement so the mistake doesn't recur) + pushed → deploy `pm-operator-9540kdppw`.
   - Verified the live prod bundle now inlines a `phc_` key + EU host
     (`https://eu.i.posthog.com`); the `phx_` key is gone.

4. **Remaining community interaction bugs fixed and verified:**
   - `joinGroup` in `apps/web/lib/services/groups.ts` now returns the existing membership
     on conflict instead of throwing "Already a member", and increments/decrements
     `groups.memberCount` consistently on join, leave, and remove.
   - New `apps/web/lib/api/client-errors.ts` helper parses `{ error: { message } }` from
     API responses so the UI can surface real server messages.
   - Updated like, comment, create-post, bookmark, join/leave circle, invite-code join,
     and profile-save handlers across community components to toast actual errors.
   - Added `dismissOverlays` to `apps/web/e2e/helpers.ts` to remove Cloudflare/Turnstile
     and cookie-consent modals that intercept clicks on production.
   - Reordered `logged-in-journey.spec.ts` to join the circle before liking/commenting.
   - Added `e2e/prod-debug.spec.ts` and `e2e/prod-smoke.spec.ts` for live-site checks.
   - Committed `6c6a91d` and deployed from the monorepo root (`pm-operator` project) →
     `dpl_6CfPZvxUWKfYk39YWDtivCoEmRDq` / `pm-operator-evwzamcgu`.
   - Production verification (Chromium/Playwright) against `operator.promptmetrics.dev`:
     `logged-in-journey.spec.ts` ✓, `prod-debug.spec.ts` ✓, `prod-smoke.spec.ts` ✓
     (1 skipped). Local specs also pass.

5. **Onboarding auth gap discovered & fixed (second follow-up):**
   - User HAR showed `POST /api/v1/reactions` and `POST /api/v1/posts/.../comments`
     returning **307 → `/register/complete?returnUrl=...`** with an HTML body, which
     the client then tried to parse as JSON → `Unexpected token '<', "<!DOCTYPE "...`.
   - Root cause: the user's account (`painfulToolStackTask=''`,
     `onboardingComplete=false`) had never finished onboarding, so the middleware
     rejected all write requests. The sign-up/OAuth flows were redirecting straight
     to `/feed` (unprotected) without completing onboarding first.
   - Fix:
     - `middleware.ts` now returns `application/json` 401/403 for `/api/v1/*`
       routes instead of HTML redirects, so the UI toasts a real error.
     - `app/auth/callback/route.ts` and `app/login/LoginForm.tsx` now redirect to
       `/register/complete?returnUrl=...` when `painfulToolStackTask` / onboarding
       is incomplete.
     - Added `/messages` to the protected community-route regex.
   - Committed `14a95e0` and deployed → `dpl_215MtL5KJmf7o5W4b64nGrd7rLaR` /
     `pm-operator-97n1fa6yd`. Production verification still passes.

## Decisions and why

- **PostHog key type must be `phc_`, not `phx_`.** `posthog-js` (client SDK) sends the
  key to PostHog's capture endpoint, which only accepts the public Project API key
  (`phc_`). A `phx_` Personal key is for server-side REST queries and (a) isn't a
  valid capture token → events dropped, (b) is private → leaking it via a
  `NEXT_PUBLIC_*` bundle exposes a credential. *Why:* PostHog's three key types are
  prefix-distinct and purpose-bound.

- **Host left at the EU Cloud default.** `NEXT_PUBLIC_POSTHOG_HOST` defaults to
  `https://eu.i.posthog.com` in code (the product is EU-hosted, `fra1`). The user's
  PostHog project is on EU Cloud, so the default is correct — no need to set the var.
  *Why:* only set it for US Cloud (`https://us.i.posthog.com`) or a self-hosted URL.

- **Redeploy via a doc-note commit (Option B), not an empty commit or Vercel-only
  redeploy.** `NEXT_PUBLIC_*` values are inlined at build time, so a fresh build was
  needed regardless. A doc-note commit (vs an empty commit) records the gotcha in-repo
  *and* triggers both GitHub Actions CI and the Vercel deploy (the user wanted both).
  A Vercel-only redeploy would have skipped CI. *Why:* a real, useful change beats an
  artificial empty commit, and it runs CI as the user asked.

- **Memory updated to mark PostHog + the `avatars` bucket as provisioned.** The prior
  memory listed them under "pending user-provisioned infra," which went stale this
  session. *Why:* keep the single source of truth current so the next session doesn't
  act on stale info.

- **(Prior, still in force) T9.0 decisions 1A/2A/3A/4A** for WS9 social — anonymize-retain
  DM erasure / public counts + self-only follower lists / drizzle-kit snapshot sync /
  in-app DM notifications only. See `specs/09-ws9-social-spec.md`.

## Pending / next steps (for the user)

1. **Revoke the leaked `phx_` Personal API key** in PostHog (Settings → Personal API
   keys → delete the `phx_`-prefixed key, the one previously set as
   `NEXT_PUBLIC_POSTHOG_KEY`). It was exposed in the public bundle between the
   `b20e21a` and `34095cd` deploys. The codebase has no server-side PostHog use, so
   you likely don't need a personal key at all — revoking it breaks nothing.

2. **Confirm PostHog ingestion end-to-end.** Visit `operator.promptmetrics.dev`, click
   around, then check PostHog → Activity / Live events. You should now see pageview +
   capture events arriving (you couldn't before — the `phx_` key was rejected).

3. **Loops email (still pending).** Transactional template IDs (`LOOPS_TX_*` or a shared
   `LOOPS_TRANSACTIONAL_QUEUE_ID`) need provisioning in Vercel for T8.4 email sends
   (solution-accepted, invite-accepted) and the weekly-digest send. `apps/web/lib/email.ts`
   is wired and preference-gated; it no-ops cleanly until these are set.

4. **Optional deeper smoke test.** The logged-in follow / DM / follower-pages flows
   need a real authed session. You could log in and click through while watching Vercel
   runtime logs for 500s. Anonymous + auth-gate paths are already confirmed healthy.

5. **T6.1–T6.4 remain intentionally deferred** (WS6 shipped without them per the report).
   Confirm with Izzy before starting them — they are NOT part of the standing request.

## Key technical context / gotchas

- **Pool-starvation rule (HARD):** ≤3 concurrent DB queries per request path; bounded
  sequential waves; no wide `Promise.all` of fanning-out services; no multi-CTE
  `db.execute(sql\`…\`)`. `DB_POOL_SIZE` defaults to 3. Avatar signed-URL resolution via
  Storage is a NETWORK call, NOT a DB query (doesn't count). This caused a 10-min prod
  outage 2026-08-02 — see memory `db-pool-starvation-trap`.

- **`NEXT_PUBLIC_*` vars are build-time-inlined** into the client JS bundle. Changing
  them in Vercel requires a NEW deploy to take effect. (This is why the PostHog fix
  needed a redeploy, not just an env-var change.)

- **App DB bypasses RLS.** `packages/db/src/index.ts` connects via the
  `postgres`/service role (Supabase `DATABASE_URL`), which BYPASSes RLS. Server-side
  Drizzle queries ignore RLS — that's why `conversation_participants_insert`
  `WITH CHECK (false)` is safe (server inserts still work; only direct PostgREST
  self-adds are blocked).

- **Migrations are NOT auto-applied on Vercel deploy.** Turbo `build` depends on
  `^build` + `^db:generate`, NOT `db:migrate`. Apply prod migrations manually via
  `DATABASE_URL=<prod> pnpm db:migrate` (or an authorized env-pull into a tempfile,
  `pnpm db:migrate`, then delete the tempfile — never log the secret).

- **drizzle-kit snapshots:** each migration's `meta/<idx>_snapshot.json` needs a unique
  `id` (uuid) + `prevId` = the previous snapshot's `id`. Migration `0014` is a
  snapshot-sync no-op — never re-add its DDL. New migrations start after `0018`.

- **CI is fully isolated from prod** (container + `pm-operator-test` project), green on
  main — see memory `ci-test-db-isolation`.

- **Before E2E:** check for an already-running dev server on port 3000 — see memory
  `e2e-dev-server-port-trap`.

- **Untracked at repo root:** `PromptMetrics Paper v3-handoff.zip` + `memory/` are
  intentionally uncommitted — leave them.

## Pointers

- Report / source of truth: `docs/DESIGN-GAP-REPORT.md` (§ "Implementation status")
- WS9 spec: `specs/09-ws9-social-spec.md` · Spec decisions log: `specs/SPEC_LOG.md`
- Analytics init: `apps/web/components/Analytics/PostHogProvider.tsx`,
  `apps/web/lib/analytics.ts`
- Email: `apps/web/lib/email.ts` · Storage (avatars): `apps/web/lib/storage.ts`
- Migrator: `packages/db/src/migrate.ts` (per-migration transactional, idempotent)
- Project memory: `~/.claude/projects/-Users-izzy-Documents-pm-operator/memory/`
  (`MEMORY.md` index + per-fact files)
- Commits: `bd03dba` (WS8/WS9 ship) · `b20e21a` (deploy docs) · `34095cd` (PostHog key
  doc-note + redeploy trigger) · `6c6a91d` (community bug fixes + E2E) · `85cdb13`
  (CI gating for prod-only E2E) · `14a95e0` (onboarding auth gap + API JSON errors,
  current `main`)
- Deploys: `pm-operator-f2him2ska` (`bd03dba`) · `pm-operator-sd8eqlhn7` (`b20e21a`) ·
  `pm-operator-9540kdppw` (`34095cd`) · `dpl_6CfPZvxUWKfYk39YWDtivCoEmRDq`
  / `pm-operator-evwzamcgu` (`6c6a91d`) · `dpl_215MtL5KJmf7o5W4b64nGrd7rLaR`
  / `pm-operator-97n1fa6yd` (`14a95e0`, current prod)
- Supabase prod project ref: `hsiyhxhrqpooplwlrmll` (eu-west-1, ACTIVE_HEALTHY)
- Vercel project: `pm-operator` (projectId `prj_8vK1ZOW1hA6WLLNBEvMhZgrsAdOY`,
  orgId `team_Lg6W6knXlq0wQOdkqZIPnGY4`). Vercel CLI is authenticated as `izzy-7941`.
  `vercel ls` works; the Vercel MCP `list_deployments` returns 403 (token scope).