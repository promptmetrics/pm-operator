# Testing guide

This guide explains how to run and maintain the `operator.promptmetrics.dev` test suite.

## Test harness

| Suite | Tool | Location | Purpose |
|---|---|---|---|
| E2E | Playwright | `apps/web/e2e/*.spec.ts` | Full browser flows: auth, access matrix, moderation, points. |
| Unit / concurrency | Vitest | `apps/web/e2e/concurrency.spec.ts` | High-concurrency service-layer assertions without a browser. |

## Required environment variables

Create `apps/web/.env.local` from `apps/web/.env.local.example` and provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL` (runtime only)
- `UPSTASH_REDIS_REST_TOKEN` (runtime only)
- `BASE_URL` (optional; defaults to `http://localhost:3000`)

## Running tests

### Unit / concurrency

```bash
pnpm --filter @pm-operator/web test:unit
```

This runs Vitest against `e2e/concurrency.spec.ts` only. The spec exercises the Drizzle service layer directly and does not need a running web server.

### E2E

Start the dev server first (or point `BASE_URL` at a deployed instance):

```bash
pnpm --filter @pm-operator/web dev
# in another shell:
pnpm --filter @pm-operator/web test:e2e
```

Playwright config is in `apps/web/playwright.config.mjs`. It runs serially (`workers: 1`) because tests share a single test database and clean up users in `afterEach`.

## Test helpers

Shared helpers live in `apps/web/e2e/helpers.ts`:

- `createTestUser(opts)` — creates a confirmed Supabase user and matching `users` row.
- `deleteTestUser(id)` — removes the application user and auth user.
- `signIn(page, email, password)` — fills the login form and waits for redirect.
- `createInviteOnlyGroup(adminId)` — creates a private circle with the user as admin.
- `createPublishedPost(groupId, authorId)` / `createHiddenPost(...)` — seed content.
- `createGroupInvite(...)` / `addGroupMember(...)` — membership helpers.
- `countPointEvents(userId, eventType)` / `getUserReputation(userId)` — assertion helpers.

## Test data conventions

- Email addresses use the pattern `{role}.{timestamp}.{random}@example.com` so parallel runs do not collide.
- Slugs and usernames include timestamps and random suffixes.
- Tests clean up created users via `test.afterEach` to avoid leaking auth records.

## Running unit tests against plain Postgres (no Supabase)

The unit/concurrency suite does not need Supabase at all. Any plain Postgres instance works:

1. Apply the Supabase shim once: `psql '<DATABASE_URL>' -f packages/db/supabase-shim.sql`
2. Run migrations: `pnpm --filter @pm-operator/db db:migrate`
3. Run tests with `TEST_DB_ONLY=1` — the helpers skip GoTrue and give test users random UUIDs.

Local recipe (Docker):

```bash
docker run -d --name pmtest -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16
psql 'postgresql://postgres:postgres@localhost:54329/postgres' -f packages/db/supabase-shim.sql
DATABASE_URL='postgresql://postgres:postgres@localhost:54329/postgres' pnpm --filter @pm-operator/db db:migrate
TEST_DB_ONLY=1 DATABASE_URL='postgresql://postgres:postgres@localhost:54329/postgres' pnpm test:unit
```

## How CI runs the suites

- **Unit tests** — the `unit-tests` job runs against a `postgres:16` service container using the shim + migrate steps above. It uses no Supabase secrets at all.
- **E2E tests** — the `e2e` job runs against the **dedicated test Supabase project**, never production. Its credentials live in the GitHub `test` environment: secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, plus the environment variable `RESET_DB_ALLOW_HOST=<test DB hostname>`. The job resets the test project with `node packages/db/reset-and-migrate.mjs --wipe-auth` at job start — that reset **is** the teardown. It then builds the app in the runner and drives `http://localhost:3000`; `PLAYWRIGHT_WEB_SERVER=1` makes Playwright start `next start` itself.
- Production is **never** touched by CI tests.

### reset-and-migrate.mjs safety guard

`packages/db/reset-and-migrate.mjs` refuses to reset any non-local host unless `RESET_DB_ALLOW_HOST=<host>` matches the target hostname, so an inherited production `DATABASE_URL` can never be wiped by accident. `--wipe-auth` also clears `auth.users` (disposable test projects only); `--no-seed` skips seeding.

### Cleaning up test debris

`packages/db/scripts/cleanup-test-debris.mjs` removes E2E/CI test debris (timestamped test users, groups, and GoTrue records) from a database as a one-off manual operation. It is dry-run by default (prints counts and sample rows), deletes only with `--execute`, and is never run in CI. It reads `DATABASE_URL` from the environment only — no `.env` loading — so the operator must paste the target URL deliberately.

## Known limitations

- The concurrency spec currently creates 100 test users synchronously inside the test body, which can be slow. Future iterations should batch user creation or use a smaller concurrency level for faster feedback.
- Rate-limit tests are not included because they depend on Upstash Redis; they should be run against a staging environment with Redis enabled.
