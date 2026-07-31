# pm-operator

`operator.promptmetrics.dev` — a Next.js 16 community platform for AI operators, founders, and teams building with AI. Replaces the legacy NodeBB headless backend with a purpose-built stack, first-class REST API, and MCP v2 alpha integration for agent access.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router |
| Monorepo | pnpm + Turborepo |
| Database | Supabase Postgres |
| Auth | Supabase Auth (OAuth + email/password) |
| ORM | Drizzle ORM + Drizzle Kit |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage (private `avatars` bucket) |
| Cache / rate limit | Upstash Redis |
| Email | Loops |
| Design system | Paper-v3 (Tailwind 4 + Radix primitives) |
| Testing | Playwright (E2E) + Vitest (unit/concurrency) |

## Workspace layout

```
pm-operator/
├── apps/web/                 # Next.js app
├── packages/
│   ├── api/                  # Zod request/response contracts
│   ├── db/                   # Drizzle schema, migrations, seed
│   ├── mcp/                  # MCP v2 alpha server (feature-flagged)
│   ├── ui/                   # Paper-v3 components
│   ├── tsconfig/             # Shared TS configs
│   └── eslint-config/        # Shared ESLint config
├── specs/                    # PRD, technical spec, UX spec, roadmap
├── docs/                     # Runbooks and env checklist
└── INTEGRATION_NOTES.md      # Build/integration log
```

## Quick start

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy environment variables:
   ```bash
   cp apps/web/.env.local.example apps/web/.env.local
   # Fill in Supabase, Upstash, Loops, and Redis credentials.
   ```

3. Run database migrations:
   ```bash
   pnpm --filter @pm-operator/db db:migrate
   ```

4. Build the workspace:
   ```bash
   pnpm turbo typecheck build --force
   ```

5. Start the dev server:
   ```bash
   pnpm --filter @pm-operator/web dev
   ```

## Testing

- **Unit / concurrency tests:**
  ```bash
  pnpm --filter @pm-operator/web test:unit
  ```

- **E2E tests** (requires dev server or `BASE_URL`):
  ```bash
  pnpm --filter @pm-operator/web test:e2e
  ```

Both test suites need the env vars in `apps/web/.env.local`.

## Scripts

| Script | Command |
|---|---|
| Typecheck all packages | `pnpm turbo typecheck` |
| Build all packages | `pnpm turbo build` |
| Generate DB migrations | `pnpm --filter @pm-operator/db db:generate` |
| Run DB migrations | `pnpm --filter @pm-operator/db db:migrate` |
| Seed database | `pnpm --filter @pm-operator/db db:seed` |

## Documentation

- [`docs/ENV-CHECKLIST.md`](./docs/ENV-CHECKLIST.md) — every env variable by scope.
- [`docs/MODERATOR-RUNBOOK.md`](./docs/MODERATOR-RUNBOOK.md) — moderation workflow.
- [`docs/ROLLBACK-RUNBOOK.md`](./docs/ROLLBACK-RUNBOOK.md) — incident rollback procedures.
- [`docs/GDPR-ERASURE-RUNBOOK.md`](./docs/GDPR-ERASURE-RUNBOOK.md) — data-subject erasure steps.
- [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md) — integration status and fixes.

## Status

Phase 0 implementation is complete. The workspace typechecks and builds end-to-end. Remaining pre-launch work is environment provisioning, MCP OAuth wiring, and running the E2E suite against a live Supabase project.
