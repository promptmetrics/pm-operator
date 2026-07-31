# Plan: Spec Pipeline for operator.promptmetrics.dev

## 1. Goal
Produce a complete, validated product and technical specification for `operator.promptmetrics.dev`: a PromptMetrics-branded community platform combining Skool-style circles/groups with daily.dev-style feed, gamification, and agent access.

## 2. What we know
- **Existing frontend:** `iiizzzyyy/promptmetrics-website` is a Next.js 16 App Router marketing site with a mature Paper-v3 design system (Tailwind v4, custom tokens, Radix primitives, TipTap editor, Redux Toolkit, Sentry).
- **Backend design doc:** `community-backend-design.md` proposes Next.js full-stack API routes + Supabase (Postgres, Auth, Realtime, Storage) + Drizzle ORM, replacing NodeBB.
- **Target repo:** `promptmetrics/pm-operator` (currently empty).
- **Access model:** Public-read, gated private groups; engagement requires login/registration.
- **Agent interface:** MCP server + REST API. User specifically referenced Anthropic’s 2026-07-28 MCP SDK update.
- **Scale:** 10–50 active users in 6 months; launch as soon as built.
- **Compliance:** EU data residency required; production-grade.

## 3. Key decisions and recommendations

### 3.1 Frontend integration — reuse Paper-v3 design system, not shadcn/ui
- **Option A: Extract Paper-v3 design system into a shared `packages/ui` in a new monorepo.**
  - *Pros:* True single source of truth; community site and marketing site share tokens, components, and TipTap config.
  - *Cons:* Upfront migration cost; must untangle marketing-site-specific code from reusable primitives.
- **Option B: Add a new `(community)` route group inside `promptmetrics-website`.**
  - *Pros:* Fastest path to launch; no package publishing; can reuse existing auth/CMS patterns.
  - *Cons:* Community concerns (dynamic, auth-required) leak into a currently static/ISR marketing site; couples community release to marketing-site deploys.
- **Option C: Standalone Next.js app in `pm-operator` that copies/tailwinds Paper-v3 tokens and imports selected components via git submodule or published package.**
  - *Pros:* Clean separation; independent deploy; easier to open-source or move later.
  - *Cons:* Duplication risk; version drift between sites.

**Recommendation:** Option A via a pnpm monorepo in `pm-operator` with `apps/web` (community), `apps/website` (migrated marketing site, optional), and `packages/ui` + `packages/db` + `packages/mcp`. We extract reusable Paper-v3 tokens/components into `packages/ui` first, then build the community app on top. This is more initial work but prevents the community site from looking like a different product.

**Pushback on shadcn/ui:** shadcn is a set of copy-paste Radix components. Paper-v3 already uses Radix primitives and has its own tokens. Adding shadcn on top would introduce a second visual language and double the styling surface. Better to componentize the existing Paper-v3 primitives into `packages/ui`.

### 3.2 Agent interface — stable MCP v1.x with migration path to 2.0
- The 2026-07-28 Anthropic blog post describes a protocol shift (request/response, `Mcp-Method`/`Mcp-Name` headers, MRTR, deprecated SSE). The current TypeScript SDK has a `2.0.0-alpha.2` and a stable `v1.29.0`.
- **Recommendation:** Build the MCP server on stable SDK v1.x with the stdio + HTTP transport options, and architect tool/resource handlers so the protocol-layer code is thin. Plan a 2.0 migration as a separate track after launch. Do NOT build production on an alpha SDK.
- The existing `/mcp-actions.json` endpoint in Paper-v3 is a lightweight custom discovery format. We can keep it as a transitional bridge and expose the full MCP server under a separate path (e.g., `/mcp` or `/api/mcp`).

### 3.3 EU data residency
- Supabase supports EU regions (e.g., `eu-central-1`). The plan must specify project region, DPA, and data handling for avatars/attachments.
- Vercel Edge traffic can still serve globally, but Postgres + Auth must be EU-hosted.

### 3.4 Infrastructure validation priorities
Because the user wants full tech/infrastructure validation but skipped commercial validation, the spec pipeline will stress:
1. Supabase regional compliance and free-tier limits vs. production-grade.
2. Next.js App Router full-stack viability for the API surface.
3. MCP server architecture and auth model.
4. Realtime feed/notifications with Supabase Realtime at low scale.
5. Gamification engine correctness (points, leaderboards, badges) and race conditions.
6. Migration from NodeBB (no data, but cutover plan).

## 4. Proposed workflow
Run the `/spec-pipeline` skill in **fast-track commercial + deep technical** mode:
- **Phase 1:** Refine concept and scan landscape (parallel PM + researcher agents).
- **Phase 3 (skip Phase 2 commercial validation):** User journeys, technical concept, AI/agent feasibility.
- **Phase 4:** Business model lightweight + deep technical feasibility and competitive positioning.
- **Phase 5:** PRD, technical spec, UX spec, roadmap.

Use multiple subagents in parallel to validate the proposed stack:
- Software Architect: validate Next.js full-stack + Supabase + Drizzle.
- AI Engineer: validate MCP server design and SDK choice.
- UX Researcher: synthesize daily.dev + Skool UX into PromptMetrics context.
- Product Manager: PRD, roadmap, prioritization.

## 5. Deliverables
All written to `/Users/izzy/Documents/pm-operator/specs/`:
- `01-concept-brief.md`
- `02-validation-report.md` (technical validation, not commercial)
- `03-concept-development.md`
- `04-feasibility-analysis.md`
- `05-prd.md`
- `06-technical-spec.md`
- `07-ux-spec.md`
- `08-roadmap.md`
- `SPEC_LOG.md`

## 6. Open questions to resolve during the pipeline
1. Exact Supabase region and project naming.
2. Whether the marketing site will be migrated into the same monorepo now or later.
3. MCP server deployment target: Next.js API route, Supabase Edge Function, or standalone service.
4. Beta invite flow: manual admin approval or automated rubric check.
5. Content moderation: human-in-the-loop only, or automated watched-phrase rejection.
