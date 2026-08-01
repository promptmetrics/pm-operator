# pm-operator Integration Notes

## Status

- `pnpm install` completed successfully at `/Users/izzy/Documents/pm-operator`.
- `pnpm turbo typecheck build --force` passes for all workspace packages (11/11 tasks successful).
- `pnpm --filter @pm-operator/web build` produces a production Next.js 16 bundle.
- `pnpm turbo db:generate` runs and produces a migration snapshot for all 20 tables.

## Workspace packages

The following packages are now wired into the workspace:

- `apps/web`
- `packages/ui`
- `packages/db`
- `packages/api`
- `packages/mcp` (MCP v2 alpha server behind `MCP_ENABLED` feature flag)
- `packages/tsconfig`
- `packages/eslint-config`

## Changes made to resolve install/typecheck

### Shared config packages

- Created `packages/tsconfig/package.json` (`@pm-operator/tsconfig`).
- Created `packages/eslint-config/package.json` (`@pm-operator/eslint-config`) with the plugin dependencies referenced by its config.
- Fixed `packages/eslint-config/index.js` so it no longer mixes CommonJS `require` with ESM `import.meta.url`.

### `packages/ui`

- Renamed package from `@promptmetrics/ui` to `@pm-operator/ui` to match workspace references.
- Added subpath exports for `./components/*` and `./editor/*` so imports like `@pm-operator/ui/components/Button` resolve through the package boundary.
- Exported `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent` from `src/index.ts`.
- Removed unused `ClassValue` type import from `Button.tsx`.
- Fixed `RichTextEditor.tsx`: avoid passing `undefined` to the TipTap `EditorContent` placeholder prop and conditionally include the `id` editor attribute only when provided.

### `packages/db`

- Fixed Drizzle index syntax for the installed `drizzle-orm@0.36.4` API:
  - Moved `.using(method, ...columns)` before `.on(...)`.
  - Replaced `unique(...).on(sql...)` with `uniqueIndex(...).on(sql...)` for expression indexes.
  - Replaced `unique(...).on(...).where(...)` with `uniqueIndex(...).on(...).where(...)` for partial unique indexes.
- Removed unused `foreignKey` import from `src/schema.ts`.
- Added `@types/node` to devDependencies so `console`/`process` are available.
- Fixed `src/migrate.ts` to import `migrate` from `drizzle-orm/postgres-js/migrator` and pass a Drizzle `db` instance.
- Simplified `DrizzleClient` type in `src/index.ts` to avoid an invalid `typeof drizzle<...>` generic.
- Fixed `src/seed.ts` literal-type widening issues by adding `as const` to seeded enum/status/role values.
- Annotated the self-referencing `comments` table with `PgTable` and cast its `.id` access inside the `parentCommentId` reference to break the TypeScript circular-inference cycle.

### `packages/api`

- Fixed `src/contracts/comments.ts` recursive `commentDetailSchema` by declaring the `CommentDetail` interface manually and explicitly typing the schema as `z.ZodType<CommentDetail>`.
- Switched `tsconfig.json` `moduleResolution` from `NodeNext` to `bundler` so Next.js can resolve source files directly via workspace path aliases.
- Removed internal `.js` extensions from package source imports so they resolve cleanly under `bundler` mode.

### `packages/mcp`

- Created the package with `package.json`, `tsconfig.json` extending `@pm-operator/tsconfig/base.json`, and exports for `createCommunityMcpServer`, tools, and resources per the MCP v2 alpha SDK.
- Switched `tsconfig.json` `moduleResolution` to `bundler` and removed internal `.js` extensions from source imports.

### `apps/web`

- Added `next-env.d.ts` (referenced by `tsconfig.json` but missing).
- Fixed `@/components/ui/checkbox` path resolution by adding a dedicated `@/components/*` alias in `apps/web/tsconfig.json`.
- Added missing `import * as React from 'react'` in `app/layout.tsx` and `app/(community)/layout.tsx` so `React.ReactNode` is defined.
- Typed the Supabase `setAll` cookie callbacks in `app/auth/callback/route.ts`, `lib/auth/server.ts`, `lib/auth/middleware.ts`, and `middleware.ts` to eliminate implicit `any` errors.
- Removed the deprecated `eslint.ignoreDuringBuilds` key from `next.config.ts` to clear the Next.js 16 config warning.

## Build-time resilience fixes

### Source resolution

- `packages/api/tsconfig.json` and `packages/db/tsconfig.json` now use `moduleResolution: "bundler"`.
- Internal source imports in `packages/api/src`, `packages/mcp/src`, `packages/ui/src`, `packages/db/src`, and `apps/web/lib/services` no longer use `.js` extensions. This fixes the `Module not found: Can't resolve './contracts/common.js'` build failure.

### Lazy database access

- `apps/web/lib/db.ts` now returns a typed stub `Proxy` when `DATABASE_URL` is missing, throwing a clear message only when a query is actually attempted (`DB.execute`, `DB.select`, etc.).
- `apps/web/lib/api/server.ts` exports a lazy `getDb()` function instead of an eagerly created `db` constant, so missing env vars do not break module load during build.
- All `apps/web/app/api/v1/**/route.ts` route handlers were migrated from `db` to `getDb()`.

### Auth / Supabase build resilience

- `apps/web/lib/auth/client.ts` returns a typed stub `Proxy` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, deferring the env error until a Supabase method is actually called at runtime.
- `apps/web/lib/auth/server.ts` returns a stub server client in the same situation, with `auth.getSession()` and `auth.getUser()` returning `{ data: null, error: null }` so server-component prerender can proceed without secrets.
- `apps/web/lib/realtime.ts` returns a stub `RealtimeClient` when Supabase env vars are missing, allowing the `RealtimeProvider` to instantiate during prerender without throwing.

### React prerender fixes

- `apps/web/app/login/page.tsx` and `apps/web/app/forgot-password/page.tsx` were converted into server components that wrap the extracted client forms (`LoginForm.tsx`, `ForgotPasswordForm.tsx`) in `<Suspense>`, fixing the `useSearchParams()` missing-suspense prerender error.
- `apps/web/app/layout.tsx` now exports `export const dynamic = 'force-dynamic'`, so DB/auth-dependent pages are not statically prerendered and do not require runtime secrets at build time.

## Phase 0 services integration

- `pnpm turbo typecheck build --force` passes for all workspace packages (11/11 tasks successful).
- `pnpm turbo db:generate` is up to date; no schema changes required on re-run.
- Verified service-role DB wiring: route handlers call `getDb()` from `@/lib/api/server`, which constructs the client via `createServiceDb()` in `@/lib/db.ts` (using `DATABASE_URL`).
- Verified server-auth wiring: server pages and actions import `getSession` / `createAuthServerClient` from `@/lib/auth/server.ts`.
- Fixed ambiguous auth imports in the registration completion flow:
  - `apps/web/app/register/complete/actions.ts`: changed `from '@/auth/server'` to `from '@/lib/auth/server'`.
  - `apps/web/app/register/complete/page.tsx`: changed `from '@/auth/server'` to `from '@/lib/auth/server'`.
- Ensured `@pm-operator/mcp` package exports are resolvable by enabling declaration emit in `packages/mcp/tsconfig.json` and rebuilding the package so `dist/src/index.js`/`dist/src/index.d.ts` exist.
- Built missing `dist` outputs for `@pm-operator/api` and `@pm-operator/ui` so their package.json exports point to real files.
- No remaining cross-module import blockers.

## Remaining warnings / known issues

- `pnpm install` reports a peer-dependency warning for `@sentry/nextjs` expecting Next.js `^13.2.0 || ^14.0 || ^15.0.0-rc.0` while the project uses Next.js 16.2.12. This does not block `typecheck` or `build`, but should be verified against Sentry's Next.js 16 compatibility matrix before production deploys.
- `apps/web/middleware.ts` uses the deprecated `middleware` file convention. Next.js 16 recommends the new `proxy` convention. The existing middleware logic still compiles and runs, but migrating it is recommended.
- `next build` logs warnings about missing `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. This is expected in a local/build environment without those secrets; rate limiting and other Redis-backed features will require the env vars at runtime.
- Next.js infers the workspace root as `/Users/izzy` because it sees multiple lockfiles (`package-lock.json` outside the project and `pnpm-workspace.yaml` inside). The build still succeeds; setting `turbopack.root` in `next.config.ts` can silence the warning if desired.
- The MCP OAuth handshake in `packages/mcp` is a stub behind the `MCP_ENABLED` flag. The tools/resources skeleton is implemented; full end-to-end MCP authorization needs the Supabase OAuth callback wiring per `specs/06-technical-spec.md`.
- The repo has no root `eslint.config.*` or per-app ESLint config files. Running `pnpm lint` / `next lint` will require further setup beyond the scope of typecheck/build.

## Test tooling updates

- Marked `apps/web/package.json` as `"type": "module"` so Playwright and Vitest configs are interpreted as ESM.
- Renamed `apps/web/playwright.config.ts` → `playwright.config.mjs` to avoid the CommonJS `import.meta` error under Playwright.
- Renamed `apps/web/vitest.config.ts` → `vitest.config.mjs` and added `server-only`/`server-only$` aliases pointing to `e2e/__mocks__/server-only.ts`, so service-only modules can be imported by Node tests.
- Added `dotenv` loading to `e2e/helpers.ts` so `.env.local` and `.env` are read before validating `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
- Added `apps/web/.env.local.example` documenting every variable required for dev, build, and tests.
- Fixed the TypeScript narrowing issue in `e2e/helpers.ts` (`databaseUrl: databaseUrl!`) so the E2E helpers build cleanly alongside the Next.js app.
- Added `NEXT_PUBLIC_SITE_URL` to `docs/ENV-CHECKLIST.md` and wired OAuth/email/password-reset redirects in `apps/web/lib/site-url.ts`, `LoginForm.tsx`, and `ForgotPasswordForm.tsx` to use the canonical public URL instead of defaulting to `localhost` in production.
- Created `docs/TESTING.md` describing the Playwright and Vitest harnesses, required env vars, and test conventions.
- Updated `docs/ENV-CHECKLIST.md` to reference the new `.env.local.example` template.
- Created `README.md` with quick-start, stack, workspace layout, scripts, and links to runbooks.

### Test suite status

- `pnpm turbo typecheck build --force` still passes (11/11 tasks successful).
- The E2E and unit suites are configured and ready to run once `apps/web/.env.local` is populated with a live Supabase project. They currently fail-fast with a clear env-missing message when vars are absent, which is the intended behavior.

## Database migration and seed fixes

- Fixed `packages/db/src/migrate.ts` and `packages/db/src/seed.ts` to load `.env`, `.env.local`, and `apps/web/.env.local` from the workspace root, so `DATABASE_URL` is found regardless of where the command is invoked.
- Updated `packages/db/src/schema.ts` and the generated migrations so the `point_events_daily_visit_idx` partial unique index uses `CAST(("awarded_at" AT TIME ZONE 'UTC') AS date)`, which is immutable and satisfies Supabase Postgres.
- Fixed `packages/db/src/schema.ts` and migrations `0000_young_king_cobra.sql` / `0006_groovy_edwin_jarvis.sql` so the trigram index uses the correct operator-class syntax `lower("content_plain") gin_trgm_ops`.
- Added `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to the top of `0000_young_king_cobra.sql` (and it was already present in `0001_triggers.sql`) so fresh Supabase projects have the extension before the trigram index is created.
- Regenerated migrations: `0005_square_the_phantom.sql` (immutable daily-visit cast), `0006_groovy_edwin_jarvis.sql` (trigram index operator class).
- Fixed `packages/db/src/seed.ts` deterministic UUID generator to emit valid UUID v4 variants that PostgreSQL's `uuid` type accepts, and added a dev-only `TRUNCATE ... RESTART IDENTITY CASCADE` reset before seeding so re-runs are clean.
- Manually enabled the `pg_trgm` extension on the existing dev Supabase project to allow the corrected migration to apply.

### Database status

- `pnpm --filter @pm-operator/db db:migrate` completes successfully.
- `pnpm --filter @pm-operator/db db:seed` completes successfully and populates the dev database with groups, users, posts, comments, reactions, badges, tiers, and watched phrases.
- `pnpm typecheck` passes for all workspace packages.
- `pnpm build` produces a production Next.js 16 bundle for `apps/web`.

## Phase 1 MVP — OAuth redirect fix and Paper v3 design system

### OAuth / email redirect fix

- Created `apps/web/lib/site-url.ts` with `getSiteUrl()` and `getAuthCallbackUrl(returnUrl)` helpers.
- Updated `apps/web/app/login/LoginForm.tsx` and `apps/web/app/forgot-password/ForgotPasswordForm.tsx` to construct `redirectTo` from `NEXT_PUBLIC_SITE_URL` instead of defaulting to `window.location.origin`.
- `apps/web/app/auth/callback/route.ts` already exchanges the code and redirects to the original `returnUrl`.
- Added the production OAuth redirect checklist to `docs/ENV-CHECKLIST.md`.

### Paper v3 design system rollout

- Extracted tokens from `PromptMetrics Paper v3-handoff.zip` and defined `--pm-*` custom properties in `apps/web/app/globals.css`, with Tailwind v4 `@theme` aliases so existing semantic classes keep working.
- Applied Paper v3 styling across auth surfaces (`login`, `forgot-password`), community surfaces (`feed`, `group`, `post detail`, `leaderboards`, `notifications`, `search`, `settings`, `comments`, `profile`), and admin surfaces (`admin`, `users`, `moderation`, `badges`, `groups`, `watched-phrases`).
- Updated shared UI primitives in `packages/ui/src/components` (`Button`, `Card`, `Input`, `Badge`, `Avatar`) and added `Tag` for color-tinted group/category chips.
- Replaced remaining hard-coded Tailwind colors (`rose-500`, `amber-500`, `black/50`, `indigo-*`) with Paper v3 `--pm-*` tokens.
- Added `data-theme="paper"` / `pm-v3` class wiring in `apps/web/app/layout.tsx`.

### Build / test resilience

- Made `apps/web/lib/db.ts` and `apps/web/e2e/helpers.ts` resilient to a missing or malformed `DATABASE_URL`, so builds and module load do not crash; instead they surface a clear error when a query is actually attempted.
- Set `turbopack.root` in `apps/web/next.config.ts` to `/Users/izzy/Documents/pm-operator`, silencing the Next.js lockfile-inference warning.

### Phase 1 status

- `pnpm turbo typecheck --filter=@pm-operator/web` passes.
- `pnpm --filter @pm-operator/web build` passes and produces the production route tree.
- `pnpm turbo typecheck build --force` passes for all 11 workspace tasks.
- `pnpm --filter @pm-operator/web test:unit` passes after the user fixed the malformed `DATABASE_URL` in `apps/web/.env.local`.
- `pnpm turbo lint --filter=@pm-operator/web` still fails. In Next.js 16 the `next lint` command no longer exists; the repo needs to migrate to a direct `eslint` invocation with either a flat `eslint.config.*` or an `.eslintrc` plus `ESLINT_USE_FLAT_CONFIG=false`. This is a separate tooling setup task and is not blocking `next build`.
- The subagent worktree at `.claude/worktrees/agent-ace9a4cee72e114c8` has been removed; its uncommitted Paper v3 edits were duplicates of changes already in the main tree.
- Production deploy completed: `https://operator.promptmetrics.dev` (Vercel project `pm-operator`, alias of deployment `dpl_8pu7U8hHEY1e9NtjdiRN9K2qB3vA`).

### Production deploy

- Vercel project: `izzys-projects-a549ecbc/pm-operator`
- Production URL: `https://operator.promptmetrics.dev`
- Deployed at: 2026-07-31 via `npx vercel --prod`
- `NEXT_PUBLIC_SITE_URL=https://operator.promptmetrics.dev` added to the Vercel Production environment and baked into the build.
- Smoke test: `GET /` → `307` → `200` at `/feed`.

### Required user actions

1. ✅ Fix `DATABASE_URL` in `apps/web/.env.local` — completed by user; unit tests now pass.
2. ✅ Set `NEXT_PUBLIC_SITE_URL=https://operator.promptmetrics.dev` in Vercel — completed.
3. In the Supabase Auth dashboard, set **Site URL** to `https://operator.promptmetrics.dev` and add `https://operator.promptmetrics.dev/auth/callback` to **Redirect URLs**.
4. Update the Google Cloud Console and GitHub OAuth apps so the redirect URI is `https://operator.promptmetrics.dev/auth/callback`.
5. ✅ Review/remove the subagent worktree — completed.
6. Run `pnpm --filter @pm-operator/web test:unit` and `pnpm --filter @pm-operator/web test:e2e` against the production build to confirm OAuth and community flows.
