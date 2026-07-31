# Concept Development: operator.promptmetrics.dev

> **Historical context:** This document captures early-phase thinking. Canonical decisions have evolved. See /Users/izzy/Documents/pm-operator/specs/SPEC_LOG.md and the latest specs (05-prd.md, 06-technical-spec.md, 07-ux-spec.md, 08-roadmap.md) for current decisions.

This document synthesizes the UX research, technical architecture validation, and MCP/agent feasibility reviews into a single product concept for `operator.promptmetrics.dev`. It is the input to the feasibility gate and the product-requirements phase that follows.

Sources tied together here:

- `specs/01-concept-brief.md` — problem, solution, value prop, principles, competitive landscape.
- `specs/02-validation-report.md` — technical and UX validation findings, assumption tests, recommended experiments.
- `community-backend-design.md` — draft Drizzle schema and backend structure.
- UX research output — personas, journeys, JTBD, touchpoints, success metrics, accessibility requirements.
- Architecture validation output — monorepo, App Router, Supabase EU, schema, gamification, realtime, build-vs-buy, risks.
- MCP/agent feasibility output — deployment target, tool/resource design, auth model, relation to REST, risks.

---

## Refined Solution Narrative

`operator.promptmetrics.dev` is a community platform for AI operators, founders, and teams with an AI mandate. It replaces the NodeBB placeholder with a purpose-built backend and Paper-v3 frontend where members join intent-based circles, share builds and questions in a live feed, earn reputation through useful contributions, and consume the same knowledge through both a human UI and agent interfaces.

The product sits at the intersection of three proven patterns:

1. **Skool-style circles** — private or public spaces with pinned lessons, leaderboards, and invite/paid gating.
2. **daily.dev-style feed** — compact cards, reputation badges, upvotes, and personalized filtering.
3. **Agent-native API** — REST + MCP so Claude Code and operator agents can search, summarize, flag, and invite as first-class workflows.

The core value proposition from `01-concept-brief.md` still holds: persistent searchable knowledge, reputation that reflects usefulness, intent-based circles, agent-ready data, and controlled access. What the validation outputs add is the concrete shape of the experience, the schema, the auth model, and the deployment path.

### What changes from the brief

- **Access model is expanded from day one.** The brief assumed "public-read with private circles." Validation showed that `is_public` alone is insufficient; the concept now uses a `visibility` enum (`public`, `invite_only`, `paid`) plus a `group_invites` table and optional `paid_tier_id`. This directly serves Priya Nair's gated-monetization job and Alex Ríos's private-cohort need.
- **Agent interface is scoped to read-first at launch.** The brief claimed "every human-facing feature reachable under `/api/v1`" and implied broad MCP parity. Feasibility review recommends shipping 4 read tools first (`search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread`) and adding write/admin tools only after the human UI is live. This reduces the risk of over-building the agent layer before user validation.
- **EU data residency is a compliance sell, not just hosting.** The brief listed it as a differentiator. Validation adds the explicit Supabase `eu-central-1` (Frankfurt) region, Vercel `fra1` region, DPA/SCC requirements, and the caveat that Vercel's US jurisdiction remains unless contractual terms cover it.
- **Gamification is hardened against drift and gaming.** The brief warned against over-gamification. Validation turns that into a concrete trigger-based counter and atomic point-award design with idempotency per event type.

### Solution statement in one paragraph

`operator.promptmetrics.dev` is a EU-resident, reputation-gated operator community built on Next.js 16, Supabase Postgres, and Drizzle. Public circles and posts drive discovery; authenticated members ask questions, share builds, and accept solutions; private circles protect paid cohorts; and a unified REST + MCP interface lets both humans and agents consume, summarize, and moderate community knowledge.

---

## User Personas

These personas come from the UX research output and are summarized in `02-validation-report.md`. They anchor every design and technical decision below.

### Alex Ríos — Senior AI Operator / Freelance Consultant

- **Role:** Builds and maintains agent stacks for clients; active in Slack, Discord, and LinkedIn operator groups.
- **Why he matters:** He is the most likely early contributor and the persona whose reputation portfolio becomes a magnet for new members.
- **Core pain**
  - Past answers are unsearchable in Slack scrollback.
  - Reputation is invisible outside direct client references.
  - Cross-posting the same problem fragments responses across platforms.
  - Private client cohorts need invite-only spaces; NodeBB gating is painful.
- **What the product must do for him**
  - Own a persistent, searchable body of answers and builds that acts as a public portfolio.
  - Earn visible reputation next to every post and comment.
  - Host or join private circles without managing a separate forum.

### Priya Nair — AI Agent Builder / Startup Founder

- **Role:** Founder shipping an agent product; wants vetted integration knowledge and API access.
- **Why she matters:** She validates the agent-native differentiator and is willing to pay for production-grade, EU-hosted infrastructure.
- **Core pain**
  - Community knowledge lives in screenshots and ephemeral threads, not structured data.
  - Existing forums block agent integration or require brittle scraping.
  - Needs EU-hosted, production-grade infra from day one.
- **What the product must do for her**
  - Query community content through a clean REST + MCP API with stable TypeScript SDK support.
  - Discover intent-based circles (e.g., "MCP Servers," "Vercel AI SDK," "multi-agent orchestration").
  - Gate premium circles by invite or paid tier while keeping public content discoverable.

### Jordan Lee — Junior Operator / Recent Builder

- **Role:** New to AI operations, learning by building; lurks before contributing.
- **Why he matters:** He represents the long tail of future contributors; the onboarding and first-contribution experience must convert him.
- **Core pain**
  - Noise in general chat channels makes it hard to find where to start.
  - Imposter syndrome when asking basic questions in public.
  - No clear path from "read" to "trusted contributor."
- **What the product must do for him**
  - Find beginner-friendly circles and curated lessons/pinned resources.
  - Make a first contribution with low stakes and get immediate positive feedback.
  - Understand how reputation and leaderboards work so progress feels tangible.

---

## User Journeys & JTBD

### Jobs-to-be-Done

The five JTBD from the UX research output are preserved here and mapped to product surfaces.

1. **Incident problem-solving** — "When I hit a tricky agent/ops issue in production, I want to ask a focused circle of peers and surface previously solved answers, so I can resolve the incident without rehashing six-month-old Slack threads."
   - Surfaces: `/g/:slug` circle page, search with accepted-solution boost, feed "unanswered" filter, realtime comments.
2. **Reputation portfolio** — "When I have built a useful operator stack or solved a hard problem, I want to showcase it to the community and earn visible reputation, so I can attract consulting clients, collaborators, or hiring interest."
   - Surfaces: profile page, shareable Operator DevCard, leaderboard, reputation badge on every post/comment.
3. **Agent-readable knowledge** — "When I am researching an integration or MCP pattern for my own agent tooling, I want a unified REST + MCP API that exposes posts, comments, users, groups, and leaderboards, so I can programmatically ingest vetted community knowledge instead of scraping."
   - Surfaces: `/api/v1/**`, `/api/mcp`, MCP tools `search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread`.
4. **Gated community monetization** — "When PromptMetrics offers a paid membership tier that unlocks a private circle or cohort, I want invite-only and paid-tier gating as a separate field from the public-read default, so I can access valuable premium discussions while keeping public discovery open."
   - Surfaces: `visibility` enum, `group_invites`, `required_tier_id`, distinct UI badges for "Invite-only" vs "Pro-tier." Paid tiers are PromptMetrics-owned.
5. **Daily learning habit** — "When I visit the site each morning, I want a gamified feed that surfaces intent-relevant circles and trusted contributors, so I can learn something useful and participate in 5–10 minutes without drowning in noise."
   - Surfaces: personalized feed cards, intent filters ("My circles," "Show Your Build," "Solutions," "Unanswered"), streaks, daily-visit points.

### Journey maps

The UX research output defined six stages. This section distills them into product implications.

| Stage | Key user action | Critical design implication |
|---|---|---|
| **Anonymous discovery** | Lands from search/social, reads a public post, browses a circle, hits login wall to engage. | Public posts and `/g/:slug` pages must render without auth. Author reputation badge must be visible immediately to answer "Can I trust this?" Login prompt must explain value prop with social proof. |
| **Signup** | Clicks OAuth or email/password. | Minimal scopes, explicit "we only read public profile" copy, inline validation, value-prop reminders tied to persona goals. |
| **Onboarding** | Answers `painful_tool_stack_task`, selects circles, sees reputation primer, follows a circle. | Frame `painful_tool_stack_task` as a matchmaker, not a survey. Rank circle recommendations by stack keywords from the answer. Seed each circle with 3–5 pinned canonical posts. |
| **First contribution** | Creates a post, receives a comment, marks a solution, earns initial points. | Inline circle suggestions, markdown toolbar, preview, prominent "Accept solution" button, realtime comment insert, next-badge-threshold feedback. |
| **Daily use** | Opens feed, reads cards, checks leaderboard, searches, reacts/replies. | daily.dev-style compact cards, intent filters, leaderboard strip, search that boosts accepted solutions and exact tag matches, sticky reply action. |
| **Moderation / leadership** | Flags content, accepts invite to private circle, manages circle, awards/verifies members. | "Flag + suggest fix" flow, separate invite-only and paid-tier UI badges, circle dashboard, public badge criteria. |

### UX success metrics

From the UX research output, retained as launch targets and month-6 targets:

| Metric | Launch target | Month 6 target |
|---|---|---|
| Signup-to-first-contribution rate within 7 days | 35% | 50% |
| Onboarding completion rate | 70% | — |
| First accepted solution within 14 days of first post | 30% | — |
| Posts with accepted solutions | 25% of answered posts | — |
| Average time to first helpful reply | under 6 hours | — |
| Like-to-view ratio | 8%+ | — |
| DAU/MAU ratio | 0.25+ for core contributors | — |
| Feed sessions per week (median, active users) | 4+ | — |
| 6-month retention of first contributors | — | 40% |
| Moderation queue resolution time | under 24 hours | — |
| False-positive flag rate | under 10% | — |
| Private group monthly activity | 80% | — |
| Agent API calls per week | — | 100+ |
| WCAG 2.1 AA audit | zero critical/serious issues | — |

---

## Information Architecture

### Site map

```
/
  ├── /login
  ├── /register/complete            # mandatory onboarding gate
  ├── /feed                         # personalized feed (authenticated)
  │     └── ?filter=my-circles|show-your-build|solutions|unanswered
  ├── /g/:slug                      # circle landing page
  │     ├── /lessons                # pinned resources / canonical posts
  │     ├── /leaderboard            # group-scoped leaderboard
  │     └── /invite                 # invite modal (members/admins)
  ├── /p/:id                        # post detail page
  ├── /u/:slug                      # public profile + reputation
  │     └── /devcard                # shareable Operator DevCard
  ├── /search?q=...                 # community search
  ├── /leaderboards                 # global leaderboards
  ├── /notifications                # notification inbox
  ├── /settings                     # profile, auth, circles
  ├── /moderation                   # flag queue (moderators/admins)
  ├── /api/v1/*                     # REST API
  └── /api/mcp                      # MCP over Streamable HTTP
```

### Circle page structure

Each `/g/:slug` page borrows from both Skool and daily.dev:

1. **Header** — circle name, description, member count, visibility badge (public / invite-only / paid), join CTA.
2. **Lessons / pinned resources** — 3–5 canonical posts pinned at the top, separate from the discussion feed.
3. **Group-scoped leaderboard** — right sidebar or sticky top, refreshed weekly.
4. **Discussion feed** — compact cards filtered by intent: questions, builds, solved, unanswered.
5. **Action bar** — create post, invite member (admin), manage circle (admin).

### Feed card anatomy

From the daily.dev pattern recommendations:

- Title preview.
- Circle tag.
- Author avatar + reputation badge + accepted-solution count.
- Engagement counts: comments, likes, reading time.
- Stack tags and repo link (for Show Your Build cards).
- Action bar: like, comment, share, save, "Ask author."

### Navigation and discovery

- Persistent top bar of circles the user follows, with member count and "new" indicator.
- Intent filters on the feed: "My circles," "Show Your Build," "Solutions," "Unanswered."
- Search results display circle tag, accepted-solution badge, and author reputation.
- Rich OpenGraph cards for public posts shared on X/LinkedIn.

### Accessibility baseline

From the UX research accessibility requirements:

- WCAG 2.1 AA compliance on all public and authenticated surfaces.
- Semantic feed structure: `role="feed"`, each card as `<article>`, clear heading hierarchy.
- Full keyboard-only signup → onboarding → create post → accept-solution flow with visible focus indicators.
- Realtime inserts do not steal focus; use `aria-live="polite"` and batch multiple inserts into one announcement.
- Modals trap focus and return focus to trigger on close.
- 4.5:1 contrast for badges, tags, progress bars; do not rely on color alone.
- Honor `prefers-reduced-motion` for point animations, leaderboard updates, and realtime inserts.
- Screen-reader accessible author info: "Post by Alex Ríos, 1,240 points, 12 accepted solutions."
- Form labels, `aria-describedby` error links, required-field indicators.
- OAuth buttons: "Continue with GitHub," not just "GitHub."

---

## Technical Concept

### Monorepo layout

Per the architecture validation output:

```text
pm-operator/
  apps/
    web/            # Next.js 16 App Router community app; hosts /api/v1/* and /api/mcp
  packages/
    ui/             # Paper-v3 design system tokens and components
    db/             # Drizzle schema, migrations, seed scripts; framework-agnostic
    api/            # Shared typed fetch client + Zod request/response contracts
    mcp/            # MCP server factory imported by apps/web
```

**Key decisions**

- No separate `apps/api`. Next.js App Router route handlers in `apps/web` host both REST and MCP. This avoids a second deploy target and keeps auth/session sharing simple.
- `packages/db` must stay framework-agnostic: only Drizzle, Postgres drivers, migrations. No Next.js imports. RLS policies live in a `policies/` folder or as reviewable comments in the schema.
- `packages/api` contains the typed fetch client and Zod contracts used by the frontend and the MCP server. No server-only secrets here.
- `packages/ui` is the Paper-v3 design system. If it contains Next.js-specific components, split them into `packages/ui/next` or keep a generic core.
- `packages/mcp` exports an MCP handler factory. For launch it mounts inside `apps/web` at `/api/mcp` using `createMcpHandler` from `@modelcontextprotocol/node`. It can be deployed standalone later without touching the web app.
- Marketing site (`promptmetrics-website`) stays in its own repo/Vercel project for launch. Migrate it into the monorepo only after the community app ships and DNS is stable.

### Next.js App Router full-stack API

- Route handlers are the deployment target for CRUD, agent loop, and MCP.
- Explicit `export const runtime = 'nodejs'` on every Drizzle-backed route to avoid accidental Edge runtime breakage.
- Middleware validates session cookies and redirects users missing `painful_tool_stack_task` to `/register/complete`. It does not perform heavy DB lookups on every request.
- Caching rules:
  - Public feed: `revalidate = 60` or short Edge cache.
  - Authenticated feed, `/api/v1/me`, profile, flags: `export const dynamic = 'force-dynamic'`.
  - Mutations: never cache.
- RSC pattern: server components fetch initial data; client components subscribe to Supabase Realtime and handle optimistic UI for reactions, comments, and new posts.

### Supabase Pro EU region and compliance

- **Primary region:** `eu-central-1` (Frankfurt).
- **Vercel region:** `vercel.json` with `"regions": ["fra1"]`.
- **Compliance checklist:**
  1. Upgrade to Supabase Pro; sign the DPA in the dashboard.
  2. Create production project in `eu-central-1` (region cannot be changed after creation).
  3. Enable RLS on every table and document policies.
  4. Turn on PITR/backups; confirm backup storage stays in the selected region.
  5. Configure OAuth providers (GitHub, Google, LinkedIn) and include their data-processing terms in the privacy policy.
  6. Set egress and usage alerts.
  7. Sign Vercel's DPA/BAA if required; review subprocessors list.
  8. Document data retention and deletion procedures for GDPR erasure requests.
  9. Use company-branded Supabase Auth email templates.
  10. Add cookie consent if using analytics or third-party embeds.
- **Caveat:** Vercel is a US entity. `fra1` gives physical EU residency, but US jurisdictional exposure (CLOUD Act) remains unless contractual terms cover it. For a true sovereignty play, a separate EU-hosted alternative may be needed later.

### Build-vs-buy decisions

| Concern | Decision | Rationale |
|---|---|---|
| Auth | Buy — Supabase Auth | OAuth, email, password reset, sessions, JWT, secure hashing out of the box. |
| Database | Buy — Supabase Postgres (Frankfurt) | Managed Postgres, backups, RLS, EU region, extensions. |
| Storage | Buy — Supabase Storage | Avatars, attachments, signed URLs. |
| Realtime | Buy — Supabase Realtime | No self-hosted WebSocket server; integrated with DB. |
| Search | Defer Meilisearch/Algolia | Postgres full-text search + `pg_trgm` is enough for 10–50 users and thousands of posts. Re-evaluate if search becomes a primary feature. |
| Rate limiting / cache | Buy — Upstash Redis | Simple Redis for rate limits and short-lived cache; Supabase does not provide this. |
| Email | Loops | Loops for transactional and lifecycle email. |

### First-week implementation sequence

From the architecture validation output, T-shirt sized:

1. **Repo & tooling** — S (~1 day): pnpm workspace, Turborepo, TypeScript, ESLint, shared tsconfig.
2. **Supabase Pro EU project + Drizzle schema + migrations** — M (2–3 days): create `eu-central-1` project; scaffold `packages/db` with tables, indexes, FKs, RLS stubs.
3. **Auth + onboarding enforcement** — M (2–3 days): Supabase Auth routes, OAuth callbacks, middleware redirect for missing `painful_tool_stack_task`, register validation.
4. **Core CRUD + feed endpoint** — L (4–5 days): groups, posts, comments, reactions, `/api/v1/feed` with group/tag filters, RLS policies.
5. **Frontend API client + profile port** — M (2–3 days): replace `web/app/lib/nodebb.ts` with `packages/api` client; port profile page; add `/g/:slug` shell.
6. **Realtime + notifications** — S (~1 day): add tables to Realtime publication; subscribe in feed/post UI; build `notifications` table.
7. **Gamification scoring** — M (2–3 days): `point_events` table, atomic score updates, idempotency for daily visit/read caps.
8. **Moderation flags + watched phrases** — S–M (1–2 days): flag creation, moderator queue, watched-phrase scanning on insert.
9. **QA + security pass** — S (~1 day): RLS tests, rate-limit stubs, env var audit.

**Current plan:** **2-week internal alpha / 4–6 week production-grade closed-alpha launch with 10 devs**. (Original estimate: one dev **10–14 days**; 2–3 devs **7–10 days**.)

---

## MCP / Agent Architecture

### Deployment target

**Recommendation:** start with a Next.js App Router API route at `app/api/mcp/route.ts` using `createMcpHandler` from `@modelcontextprotocol/sdk` (v2 alpha / 2026-07-28).

This keeps the MCP surface in the same deploy unit as `/api/v1`, shares Drizzle/Supabase clients, auth helpers, and RLS logic, and matches the small-team, fast-launch mandate.

**Heavy-tool mitigation:** instrument every MCP tool with a P95 latency metric from day one. If P95 exceeds 2 s, split the tool into "start job" + `community://jobs/{job_id}` resource, using Supabase `pgmq` or Inngest for async work.

### Initial tool set

Feasibility review recommends at least 8 tools, scoped and auditable:

| Tool | Scope | Purpose |
|---|---|---|
| `search_posts` | `community:read` | Discovery |
| `get_user_profile` | `community:read` | Reputation lookup |
| `list_leaderboards` | `community:read` | Trust signal |
| `summarize_thread` | `community:read` | Agent-native comprehension |
| `create_post_reply` | `community:write` (own) / `community:system` (on-behalf-of) | Agent writes |
| `create_invite` | `community:write` + admin where needed | Growth |
| `flag_post` | `community:write` | Moderation triage |
| `accept_solution` | `community:write` (post author or moderator) | Quality signal |
| `award_points` | `community:admin` / `gamification:admin` | Admin gamification |
| `grant_badge` | `community:admin` / `gamification:admin` | Admin gamification |

Do not expose raw SQL or admin config tools at launch.

### Resources

Resources are better than tools for stable, addressable objects an agent might reference repeatedly:

- `community://leaderboards/{type}?group_slug={slug}&period={period}`
- `community://users/{slug}`
- `community://groups/{slug}`
- `community://posts/{id}`
- `community://feed?group_slug={slug}&tag={tag}&sort={sort}&page={page}`

Resource templates (unbounded):

- `community://threads/{post_id}/summary`
- `community://users/{slug}/reputation-history`
- `community://jobs/{job_id}` for async heavy work

### Authentication model

**Dual-token model:**

1. **Supabase JWT** — used by the Paper-v3 UI and REST `/api/v1`. Identifies a real `users` row via `sub`. RLS policies enforce row-level access. Required for human-attributed writes.
2. **MCP OAuth access token** — issued to agent clients (Claude Code, future operator agents) for the MCP route. Carries `clientId` and scopes. Decoded via `ctx.http.authInfo` inside `createMcpHandler`. The MCP server acts as an OAuth Resource Server, not an Authorization Server; it reuses Supabase Auth for user identity.

**Scopes:**

| Scope | Meaning |
|---|---|
| `community:read` | Read public posts, profiles, groups, leaderboards |
| `community:write` | Create posts/comments/reactions/invites as an attributed user |
| `community:moderate` | Create flags, resolve flags, watch phrases |
| `community:admin` | Award points, grant badges, create groups, delete content |
| `community:system` | Act on behalf of a user (requires explicit `on_behalf_of_user_slug`) |

**Attribution rule:** every MCP-mediated mutation records both the OAuth `clientId` (agent audit) and the target community `user_id`. For normal user writes, the tool requires a `user_slug` parameter and verifies the caller has `community:write`. For system-agent replies, require `community:system` and an explicit `on_behalf_of_user_slug`.

**Critical:** the Supabase service-role key is held server-side only and used for cross-RLS operations such as global leaderboards. It is never accepted directly from a client.

### How MCP relates to `/api/v1` REST

Both interfaces call the same service layer. The difference is transport and caller intent.

| Concern | REST `/api/v1/**` | MCP `/api/mcp` |
|---|---|---|
| Primary caller | Paper-v3 UI, mobile web | Claude Code, operator agents, automation |
| Auth | Supabase Auth cookie/JWT | MCP OAuth 2.0 bearer token + scopes |
| Transport | HTTP request/response, JSON | Streamable HTTP / stateless MCP envelopes |
| Best for | UI CRUD, OAuth callbacks, file uploads, realtime setup | Discovery, search, summarization, batch reads, moderation assistance |
| Writes | All user-attributed writes | Limited, auditable writes (flag, invite, system reply, admin gamification) |

**Rule of thumb:** if a human would click a button in the UI, expose it in REST. If an agent would "discover, decide, then act," expose it in MCP.

### Concrete files to create

- `app/api/mcp/route.ts` — handler entry point.
- `lib/mcp/server.ts` — `createCommunityMcpServer` factory.
- `lib/mcp/tools.ts` — tool definitions with Zod schemas.
- `lib/mcp/resources.ts` — resource/resource-template definitions.
- `lib/mcp/auth.ts` — `OAuthTokenVerifier` and scope helpers.
- `lib/mcp/audit.ts` — agent action logging.
- `docs/MCP-AUTH.md` — client registration and scope reference.

---

## Data Model Highlights

The draft schema in `community-backend-design.md` is viable but needs the indexes, FK hardening, counters, and access expansion identified in the architecture validation output.

### Group access model

Replace `is_public` with:

```sql
visibility text not null default 'public',      -- public, invite_only, paid
required_tier_id uuid references membership_tiers(id)  -- null unless paid; PromptMetrics-owned tiers
```

Add `membership_tiers` table:
```sql
id uuid primary key default gen_random_uuid()
slug text unique not null
name text not null
description text
price numeric(10,2)
currency text default 'EUR'
interval text default 'month'            -- month, year, one_time
features jsonb default '[]'
is_active boolean default false         -- false at launch
```

Add `user_memberships` table:
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references users(id) on delete cascade
tier_id uuid references membership_tiers(id) on delete set null
status text default 'active'            -- active, cancelled, past_due, expired
started_at timestamptz default now()
expires_at timestamptz
unique(user_id, tier_id)
```

Add a `group_invites` table:

```sql
id uuid primary key default gen_random_uuid()
group_id uuid references groups(id) on delete cascade
code text unique not null
inviter_id uuid references users(id)
max_uses integer default 1
used_count integer default 0
expires_at timestamptz
role text default 'member'
```

This satisfies the gated-monetization JTBD and resolves the under-specified group access risk.

### Missing indexes to add

| Table | Index | Why |
|---|---|---|
| `users` | `role`; case-insensitive unique on `lower(username)` and `lower(userslug)` | admin lookups; case-insensitive login |
| `groups` | `(visibility, created_at)` | feed filtering; public/private group lists |
| `group_memberships` | `(user_id, role)` | "my groups" query |
| `posts` | composite `(group_id, status, created_at)`; GIN on `tags`; full-text index on `content_plain`; index on `type`, `status` | feed, search, tag filtering |
| `comments` | `(post_id, created_at)`; `(post_id, parent_comment_id, created_at)` | thread ordering |
| `reactions` | `(target_type, target_id)`; partial unique on `(user_id, target_type, target_id)` | count queries; prevent duplicate reactions |
| `point_events` | `(user_id, awarded_at)`; `(event_type, awarded_at)`; partial unique on `(user_id, event_type, awarded_at::date)` for daily caps | leaderboards, daily caps, analytics |
| `flags` | `(target_type, target_id, status)` | moderation queue |
| `invites` | `code` unique; `inviter_id`; `used_by_user_id` | invite lookup and acceptance |

### Foreign-key / integrity fixes

- `posts.accepted_comment_id` must reference a comment on the same post. Enforce via trigger or application check.
- `comments.parent_comment_id` uses `ON DELETE CASCADE`; document that deleting a parent removes the subtree.
- `flags.resolver_id` needs FK to `users(id)`.
- Add nullable `group_id` column to `point_events`; do not rely on JSONB `context` for group-scoped leaderboards.

### Notifications table

Define the table referenced by Realtime but missing from the draft schema:

```sql
CREATE TABLE notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,        -- comment, reaction, solution, invite, flag
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz default now()
);
```

### RLS policy design

Enable RLS on every table. Core policies:

- **`users`**: anyone can read public profile fields; user can update own row; admins can read all.
- **`groups`**: public groups readable by anyone; private/invite-only/paid groups readable only by members and admins.
- **`group_memberships`**: user can see own memberships; group admins can see their group's memberships.
- **`posts` / `comments`**: read if group is public or user is a member; write own content; moderators can update `status`.
- **`reactions`**: read public; insert/delete own only.
- **`point_events`**: read own only. Leaderboard data served by API using service-role aggregation.
- **`flags`**: read by moderators/admins; insert by authenticated users.
- **`invites`**: read by inviter/admin; accept via service logic.

Use `auth.uid()` for user checks. Service-role operations bypass RLS automatically.

### File uploads / Storage

Supabase Storage is the target for avatars and attachments, but the exact design is still open. The concept assumes:

- A private bucket for avatars with signed URLs.
- A private bucket for post/comment attachments.
- RLS on buckets tied to `auth.uid()`.
- Client-side file-type and size validation before upload.
- Signed-URL TTL chosen to balance caching and security.

---

## Gamification Engine

### Point event philosophy

Reputation must reflect usefulness, not activity. The point table from the brief is hardened by the architecture validation output:

- `solution_accepted` > `like_given` in weight.
- `topic_created` and `comment_created` reward participation, but quality signals (accepted solutions, likes received) carry more weight.
- Daily caps prevent gaming: `daily_visit`, `posts_read`, `like_given`.

### Atomic scoring

Do not read `reputation_score`, add points in JavaScript, and write back. Use an atomic SQL update wrapped in a transaction:

```sql
BEGIN;
  INSERT INTO point_events (user_id, event_type, points, source_id, group_id) VALUES (...);
  UPDATE users
  SET reputation_score = reputation_score + $points
  WHERE id = $user_id
  RETURNING reputation_score;
COMMIT;
```

### Idempotency per event type

| Event | Idempotency mechanism |
|---|---|
| `topic_created` | unique `(user_id, event_type, source_id)` where `source_id = post_id` |
| `comment_created` | unique `(user_id, event_type, source_id)` where `source_id = comment_id` |
| `solution_accepted` | one solution per post via `posts.accepted_comment_id`; award points once to comment author |
| `like_received` / `like_given` | guaranteed by `reactions` unique constraint; trigger awards points |
| `invite_accepted` | one award per `invites.id` row; status prevents re-use |
| `daily_visit` | unique partial index on `(user_id, (awarded_at::date))` where `event_type = 'daily_visit'` |
| `posts_read` | daily-cap table with atomic `INSERT ... ON CONFLICT ... DO UPDATE` and a `count < cap` guard |

For `daily_visit` and `posts_read`, use a separate `user_daily_stats` table rather than scanning `point_events` to compute caps. It is faster and race-safe.

### Leaderboards

Maintain a `user_scores` summary table via triggers:

```sql
CREATE TABLE user_scores (
  user_id uuid references users(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade, -- sentinel group UUID with FK
  period text not null, -- all_time, quarterly, etc.
  score numeric(12,2) not null default 0,
  primary key (user_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'), period)
);
```

A trigger on `point_events` increments or decrements the relevant rows. Leaderboard reads become a simple indexed sort with `rank()` or `dense_rank()`. This avoids materialized-view refresh lag and stale-cache bugs.

### Denormalized counters (DB triggers only)

| Counter | Where | Strategy |
|---|---|---|
| `posts.upvotes` | `posts` | Trigger on `reactions` insert/delete |
| `posts.comment_count` | `posts` | Trigger on `comments` insert/delete |
| `posts.view_count` | `posts` | Write to `post_views` log table; aggregate periodically |
| `users.reputation_score` | `users` | Atomic `UPDATE ... SET reputation_score = reputation_score + N` in transaction |
| `groups.member_count` | `groups` | Trigger on `group_memberships` insert/delete |

Do not use application-level read-modify-write for counters; that is the most common source of drift.

### Badge and progress UX

- Progress bar toward the next badge in the user dropdown, with exact point thresholds.
- Public badge criteria: e.g., "10 accepted solutions" for a "Verified Operator" badge.
- Leaderboards combine points with accepted-solution weighting so volume does not dominate quality.

---

## Realtime & Notifications

### What to broadcast

- New posts in a group: channel `group:<slug>:posts`.
- New comments on a post: channel `post:<id>:comments`.
- Notification count changes: channel `user:<id>:notifications`.

Add the tables to the `supabase_realtime` publication:

```sql
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table posts, comments, notifications;
commit;
```

### Client behavior

- Feed page: RSC fetches the first page server-side; a client component subscribes to `group:<slug>:posts` and handles pagination.
- Post detail: RSC renders the post and first comments; client component handles new comments, reactions, and optimistic UI.
- Notification bell: query unread count on app load, then listen to `user:<id>:notifications` for updates.

### Limits and caveats

- Pro includes 500 peak connections and 5M messages/month; at 10–50 active users this is ample but must be monitored.
- Realtime has at-least-once, not exactly-once, delivery. Clients handle duplicate messages by checking IDs.
- No guaranteed ordering across channels. For comment threads, rely on `created_at` sorting after receiving the event.
- Offline users miss Realtime events; they must rehydrate from the `notifications` table on reconnect.
- Realtime inserts must not steal focus; use `aria-live="polite"` and batch announcements.

---

## Security & Compliance Model

### Data residency

- Supabase production project in `eu-central-1` (Frankfurt).
- Vercel functions pinned to `fra1`.
- Signed Supabase DPA and Vercel DPA/SCCs where required.
- Document jurisdictional limits: Vercel is a US entity; physical EU residency does not eliminate US legal exposure.

### Authentication and authorization

- Supabase Auth for human identity (OAuth, email, password reset).
- MCP OAuth access tokens for agent clients, decoded in `createMcpHandler`.
- Service-role key held server-side only; never accepted from clients.
- Mandatory onboarding field `painful_tool_stack_task` enforced in middleware and API: post-auth redirect to `/register/complete`, all write endpoints blocked until set.
- RLS on every table; service-role used only for cross-RLS aggregation and admin operations.

### Abuse prevention

- Rate limiting on public endpoints and MCP route before launch (Upstash Redis or Vercel native).
- Watched phrases default to auto-flag, not auto-reject.
- New-user restrictions (e.g., posting limits until first accepted solution or time threshold).
- Moderation queue with triage and bulk actions to prevent leader burnout.

### GDPR / privacy

- Document data retention and deletion procedures.
- Support erasure requests via service-role deletion flows.
- Use company-branded Supabase Auth email templates.
- Add cookie consent if analytics or third-party embeds are used.
- Include OAuth provider data-processing terms in the privacy policy.

---

## Key Decisions & Trade-offs

| Decision | What we chose | Why | Trade-off |
|---|---|---|---|
| **Monorepo layout** | `apps/web` + `packages/{ui,db,api,mcp}`; no `apps/api` | Single deploy unit shares auth, ORM, and RLS logic. | Marketing site stays separate for launch; merge later. |
| **MCP deployment** | Next.js App Router route at `/api/mcp` using `createMcpHandler` | Fastest path to agent integration; shares backend with REST. | Serverless timeouts cap long tools; heavy work moves to async jobs. |
| **MCP launch scope** | Read tools first: `search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread` | Avoids over-building agent layer before human UI validation. | Write/admin tools ship after REST UI is live and moderation needs are proven. |
| **Group access** | `visibility` enum (`public`, `invite_only`, `paid`) + `group_invites` table + `membership_tiers`/`user_memberships` | Supports PromptMetrics-owned paid tiers that unlock specific circles; free-only at launch. | More complex access matrix than a simple `is_public` boolean. |
| **Search** | Postgres full-text search + `pg_trgm`; defer Meilisearch/Algolia | Sufficient for 10–50 users and thousands of posts; keeps infra simple. | Less relevance tuning, no typo-tolerance, no faceted search. |
| **Counters** | DB triggers, not application read-modify-write | Prevents drift under concurrent reactions/comments. | More trigger code to maintain and test. |
| **Gamification leaderboards** | `user_scores` summary table maintained by triggers | Fast reads without materialized-view refresh lag. | Extra table and trigger logic. |
| **Daily caps** | Separate `user_daily_stats` table, not scans of `point_events` | Race-safe and faster for `daily_visit` / `posts_read` caps. | Extra table to keep in sync. |
| **EU hosting** | Supabase `eu-central-1` + Vercel `fra1` | Physical EU residency and low latency for German/EU ICP. | Vercel's US jurisdictional exposure remains; full sovereignty may require a future EU-hosted alternative. |
| **Auth model** | Supabase JWT for humans + MCP OAuth token for agents | Clear separation of human and agent identity; service role stays server-side. | Two token systems to implement and document. |
| **Realtime** | Supabase Realtime for posts, comments, notifications | No self-hosted WebSocket server; integrated with DB. | At-least-once delivery; clients must dedupe and rehydrate. |
| **Email** | Loops | Loops for transactional and lifecycle email. | Branded transactional and lifecycle email handled by Loops. |

---

## Open Questions

These questions are carried forward from `02-validation-report.md` and the validation outputs. They must be resolved before or during the PRD/spec phase.

1. **Group access model:** Is `visibility` enum + `required_tier_id` + `group_invites` + `membership_tiers`/`user_memberships` the final design, or do we need additional `hidden` / `archived` states?
2. **Notifications table:** What exact notification types and payload shapes does the frontend need? Should we generate a row per event or batch digestible notifications?
3. **Invite system:** Do invite codes need role assignment, expiration, max uses, single-use only, or email-based invites?
4. **Search strategy:** Do we commit to Postgres full-text search for launch and defer Meilisearch/Algolia, or is typo-tolerance/faceted search a launch requirement?
5. **File uploads / Storage RLS:** What buckets, file-size limits, signed-URL TTLs, and content moderation are required for avatars and attachments?
6. **Rate limiting and abuse prevention:** What per-route and per-client limits should we enforce before launch, and which provider (Upstash Redis or Vercel native)?
7. **Email provider:** Supabase default templates, Resend, or Loops? What branding and deliverability requirements exist?
8. **MCP SDK version:** Do we adopt v2 `createMcpHandler` immediately, or v1.x with dual-era support and migrate later?
9. **`accepted_comment_id` integrity:** Should the database enforce that the accepted comment belongs to the post via trigger, or is application-level validation enough?
10. **`point_events` group scoping:** Should we add a nullable `group_id` column and migrate JSONB `context` usage, or keep JSONB-only and accept the performance/complexity cost?
11. **Marketing site migration:** What is the exact trigger to move `promptmetrics-website` into the monorepo, and who owns DNS cutover?
12. **EU legal positioning:** Do we need a separate EU-hosted compute alternative later, or are Vercel DPA/SCCs sufficient for the ICP?
13. **Beta invite flow:** Manual approval vs. automated rubric check for early users?
14. **Content moderation:** Human-in-the-loop only, or automated watched-phrase rejection beyond auto-flag?
15. **Onboarding A/B test:** What copy and ranking algorithm for `painful_tool_stack_task` maximize the 70% completion target?

---

*Next step: feasibility gate review. If accepted, this document feeds directly into the PRD, technical spec, UX spec, and roadmap.*
