# Environment Variable Checklist

This checklist documents every environment variable used by `operator.promptmetrics.dev`, grouped by scope and requiredness.

## Legend

- **Server** — only used server-side; never expose to the browser.
- **Public** — exposed to the browser via a `NEXT_PUBLIC_` prefix.
- **Build** — read at build time by Next.js / Drizzle Kit.
- **Test** — used by the E2E / unit test harness; not required in production.

## Required server variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Server / Build | Postgres connection string used by `packages/db` migrations, seed, and the web service-role client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Supabase service-role key for storage signed URLs, admin auth operations, and service-role DB work. |
| `UPSTASH_REDIS_REST_URL` | Server | Upstash Redis REST endpoint for rate limiting and short-lived cache. |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Upstash Redis REST token. |
| `LOOPS_API_KEY` | Server | Loops API key for transactional/lifecycle email. |
| `CRON_SECRET` | Server | Shared secret protecting `/api/v1/admin/jobs/*` endpoints. |
| `MCP_TOKEN_SECRET` | Server | Secret used to issue/verify MCP bearer tokens. |

## Required public variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL used by browser, middleware, and server SSR clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key used by browser, middleware, and server SSR clients. |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical public site URL used for OAuth/email redirects and callback construction. Must match the production domain (e.g., `https://operator.promptmetrics.dev`). |

## Feature flags

| Variable | Scope | Purpose |
|----------|-------|---------|
| `MCP_ENABLED` | Server | Enables the `/api/mcp` route when set to `true`. Disable instantly without a deploy. |
| `NEXT_PUBLIC_OAUTH_GITHUB_ENABLED` | Public | Enables GitHub OAuth on the login page. |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | Public | Enables Google OAuth on the login page. |
| `NEXT_PUBLIC_OAUTH_LINKEDIN_ENABLED` | Public | Enables LinkedIn OIDC OAuth on the login page. |

## Optional / tuning variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `SUPABASE_URL` | Server | Optional alias for `NEXT_PUBLIC_SUPABASE_URL` on the server. |
| `SUPABASE_ANON_KEY` | Server | Optional alias for `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the server. |
| `SENTRY_DSN` | Server | Sentry ingestion DSN for server-side error reporting. |
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Sentry ingestion DSN for client-side error reporting. |
| `LOOPS_TRANSACTIONAL_QUEUE_ID` | Server | Loops queue ID for transactional email sends. |
| `OPENAI_API_KEY` | Server | OpenAI API key for optional AI-assisted features (e.g., thread summarization). |
| `ANTHROPIC_API_KEY` | Server | Anthropic API key alternative for AI-assisted features. |
| `AVATAR_MAX_SIZE_MB` | Server | Maximum avatar upload size in megabytes. |
| `AVATAR_SIGNED_URL_TTL_SECONDS` | Server | TTL for Supabase Storage signed avatar URLs. |
| `LOG_LEVEL` | Server | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). Defaults to `info`. |
| `NODE_ENV` | Server / Build | Runtime environment (`development`, `production`, `test`). |

## Test-only variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `BASE_URL` | Test | Base URL for Playwright E2E tests (defaults to `http://localhost:3000`). |
| `TEST_DB_ONLY` | Test | When `1`, test helpers skip GoTrue and create users with random UUIDs, so unit/concurrency tests run against any plain Postgres (no Supabase project needed). |
| `RESET_DB_ALLOW_HOST` | Test | Arms `packages/db/reset-and-migrate.mjs` for a specific non-local hostname. Without it the reset script refuses any remote database, protecting production. Set to the test DB hostname in CI. |
| `PLAYWRIGHT_WEB_SERVER` | Test | When `1`, Playwright starts `next start` itself instead of expecting an already-running server. Used by the CI e2e job. |

In CI, the e2e job reads its Supabase credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) and `RESET_DB_ALLOW_HOST` from the GitHub `test` environment, which points at the dedicated test Supabase project — never production. See `docs/TESTING.md`.

## Local development template

Copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill in real values for each variable above. The example file documents every variable used by the app and the test harness.

## Notes

- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `LOOPS_API_KEY`, `MCP_TOKEN_SECRET`, `OPENAI_API_KEY`) must never be referenced in client bundles or logs.
- `MCP_ENABLED` is the source-of-truth feature flag for the MCP route. `NEXT_PUBLIC_MCP_ENABLED` is a legacy name and should not be used in new configuration.
- The web app reads all Supabase values from `NEXT_PUBLIC_SUPABASE_*`; `SUPABASE_URL` / `SUPABASE_ANON_KEY` are tolerated as aliases but are not required.

## Production OAuth redirect checklist

For Google/GitHub/email sign-in to redirect to the right origin, configure both Vercel and the Supabase Auth dashboard:

1. **Vercel / deployment environment**
   - Set `NEXT_PUBLIC_SITE_URL=https://operator.promptmetrics.dev` (no trailing slash).
2. **Supabase Auth → URL configuration**
   - **Site URL:** `https://operator.promptmetrics.dev`
   - **Redirect URLs:** add `https://operator.promptmetrics.dev/auth/callback`
3. **OAuth provider consoles**
   - **Google Cloud Console:** Authorized redirect URI must be `https://operator.promptmetrics.dev/auth/callback`.
   - **GitHub OAuth app:** Authorization callback URL must be `https://operator.promptmetrics.dev/auth/callback`.

The app constructs the callback URL in `apps/web/lib/site-url.ts` using `NEXT_PUBLIC_SITE_URL`, and `apps/web/app/auth/callback/route.ts` exchanges the code and sends the user to the original `returnUrl`.
