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

## Known limitations

- The E2E suite requires a live Supabase project with the service role key. It cannot run in a pure local/offline environment.
- The concurrency spec currently creates 100 test users synchronously inside the test body, which can be slow. Future iterations should batch user creation or use a smaller concurrency level for faster feedback.
- Rate-limit tests are not included because they depend on Upstash Redis; they should be run against a staging environment with Redis enabled.
