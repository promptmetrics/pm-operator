# Validation Report: operator.promptmetrics.dev

> **Historical context:** This document captures early-phase thinking. Canonical decisions have evolved. See /Users/izzy/Documents/pm-operator/specs/SPEC_LOG.md and the latest specs (05-prd.md, 06-technical-spec.md, 07-ux-spec.md, 08-roadmap.md) for current decisions.

## User Personas & JTBD

### Primary personas

| Persona | Role | Core motivation |
|---|---|---|
| **Alex Ríos** — Senior AI Operator / Freelance Consultant | Builds agent stacks for clients; active in Slack/Discord/LinkedIn | Wants a persistent, searchable portfolio and visible reputation that attracts clients |
| **Priya Nair** — AI Agent Builder / Startup Founder | Founder shipping an agent product | Needs vetted integration knowledge, REST + MCP API, EU-hosted production infra, and gated circles |
| **Jordan Lee** — Junior Operator / Recent Builder | Learning by building; lurks before contributing | Wants beginner-friendly circles, low-stakes first contribution, and transparent reputation progression |

### Jobs-to-be-Done

1. **Incident problem-solving** — Ask a focused circle and surface previously solved answers instead of rehashing old Slack threads.
2. **Reputation portfolio** — Showcase solved problems and builds to attract consulting, collaboration, or hiring interest.
3. **Agent-readable knowledge** — Ingest vetted community knowledge programmatically via REST + MCP instead of scraping.
4. **Gated community monetization** — Host invite-only or paid-tier circles while keeping public content discoverable.
5. **Daily learning habit** — Spend 5–10 minutes each morning in a gamified, intent-relevant feed without drowning in noise.

## User Pain Points

### Alex
- Past answers are unsearchable in Slack scrollback.
- Reputation is invisible outside direct client references.
- Cross-posting the same problem across Slack, Discord, and LinkedIn fragments responses.
- Private client cohorts need invite-only spaces; NodeBB makes gating and API access painful.

### Priya
- Community knowledge lives in screenshots and ephemeral threads, not structured data.
- Existing forums block agent integration or require brittle scraping.
- Needs EU-hosted, production-grade infra from day one.

### Jordan
- General chat noise makes it hard to find where to start.
- Imposter syndrome when asking basic questions in public.
- No clear path from "read" to "trusted contributor."

### Cross-persona UX friction
- Anonymous users cannot tell what is public-read versus auth-required.
- Mandatory onboarding field (`painful_tool_stack_task`) feels like a survey, not a matchmaker.
- Circle choice overload after onboarding.
- Feed over-promotes popular posts instead of unanswered questions in the user's stack.
- Realtime inserts can flood the feed with low-signal content.
- Moderation queue lacks triage and bulk actions, burning out leaders.

## Assumption Tests

| # | Assumption | Why it matters | Test |
|---|---|---|---|
| 1 | Next.js App Router route handlers in `apps/web` can host both `/api/v1/*` REST and `/api/mcp` without a separate backend service | Determines monorepo layout and deployment complexity | Build a spike route with Drizzle query and MCP `ping` tool; measure cold-start latency in `fra1` |
| 2 | `eu-central-1` (Frankfurt) Supabase + `fra1` Vercel satisfies EU data-residency expectations for German/EU operators | Compliance sell to Priya; latency to DB | Confirm Supabase project region cannot be migrated later; document Vercel DPA/SCC limitations |
| 3 | Postgres full-text search + `pg_trgm` is sufficient for 10–50 active users and thousands of posts | Search strategy is currently undecided | Index `to_tsvector` on `content_plain`, run relevance benchmark against expected query set |
| 4 | Denormalized counters maintained by DB triggers prevent drift under concurrent reactions/comments | Drift breaks leaderboard and feed trust | Load-test concurrent like/comment inserts; compare `posts.upvotes`/`comment_count` to source rows |
| 5 | Atomic `UPDATE users SET reputation_score = reputation_score + N` + unique partial indexes prevents duplicate points | Gamification integrity is core to reputation | Concurrently award points for same event; verify exactly one `point_events` row and one score delta |
| 6 | Supabase Realtime can deliver new-post/comment/notification events without stealing focus or overwhelming feed | Daily-use UX hinge | Subscribe to `group:<slug>:posts`; verify duplicate-message handling, reconnect rehydration, and polite `aria-live` behavior |
| 7 | Mandatory `painful_tool_stack_task` improves circle fit enough to offset drop-off | Onboarding completion target is 70% | A/B test framing: "matchmaker" copy vs survey copy; track completion and 7-day contribution rate |
| 8 | Minimal-scope OAuth reduces signup friction and scope anxiety | Trust hinge at OAuth consent screen | List exact scopes per provider; run 5 usability signups and ask users to read scope copy aloud |
| 9 | daily.dev-style compact cards + Skool-style lessons/pinned resources reduce scanning fatigue and build learning habits | Feed is the primary daily surface | Prototype two feed variants; measure scroll depth and first contribution within 7 days |
| 10 | MCP read-first launch (search, profile, leaderboards, thread summary) delivers value before write/admin tools | Avoids over-building agent layer pre-validation | Ship 4 read tools to Claude Code users; count successful tool calls and agent projects citing community answers |
| 11 | Dual-token auth (Supabase JWT for humans, MCP OAuth token for agents) is implementable without conflating identity | Safety and attribution hinge | Implement OAuth verifier in `app/api/mcp/route.ts`; test that service-role key is never accepted from clients |
| 12 | `visibility` enum (`public`, `invite_only`, `paid`) + `group_invites` table satisfies gated-monetization needs | Priya's core job; currently under-specified | Model access matrix in schema; write unit tests for every visibility × membership × paid-tier combination |

## Recommended Validation Experiments

1. **Onboarding framing test** (week 1)
   - Change the `painful_tool_stack_task` label to "Tell us your hardest stack problem so we can place you in the right circles."
   - Metric: onboarding completion rate moves from baseline toward 70%.

2. **Circle-fit smoke test** (week 1–2)
   - Rank circle recommendations by stack keywords from onboarding answer.
   - Metric: % of users who join 2–4 circles and return within 48 hours.

3. **Realtime UX test** (week 2)
   - Seed 3–5 pinned canonical posts in each circle, then enable Supabase Realtime.
   - Metric: users can create a post and receive a first comment within 6 hours; duplicate/offline events handled without focus theft.

4. **Search relevance benchmark** (week 2)
   - Index `content_plain` with `to_tsvector` + GIN; compare top-5 results for 20 operator queries against accepted-solution boost.
   - Metric: solved posts rank in top-3 for 75% of queries.

5. **Gamification concurrency test** (week 2)
   - Hammer `reactions` and `comments` with 100 concurrent inserts.
   - Metric: zero duplicate `point_events`; counters match source tables.

6. **First-contribution cohort test** (weeks 1–4)
   - Track signup → post → accepted-solution funnel.
   - Metric: 35% signup-to-first-contribution within 7 days at launch, 50% by month 6.

7. **MCP read-only pilot** (week 3)
   - Deploy `search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread` to a small Claude Code user group.
   - Metric: P95 tool latency under 2 s; 100+ agent API calls/week by month 3.

8. **Accessibility pass** (week 4)
   - Keyboard-only signup → onboarding → create post → accept-solution flow.
   - Metric: zero critical/serious WCAG 2.1 AA issues.

9. **Gated circle access matrix test** (week 4)
   - Test public, invite-only, and paid-tier circles with and without membership.
   - Metric: no leakage of private posts; public circles remain discoverable and SEO-friendly.

## Technical Infrastructure Validation

### Monorepo
- **Recommendation:** `pnpm` workspaces + Turborepo.
- **Layout:**
  - `apps/web` — Next.js 16 App Router community app, hosts `/api/v1/*` and `/agent/mcp`.
  - `packages/ui` — Paper-v3 design system.
  - `packages/db` — Drizzle schema, migrations, seed scripts; framework-agnostic, no Next.js imports.
  - `packages/api` — shared typed fetch client and Zod contracts used by web and MCP.
  - `packages/mcp` — MCP handler factory imported by `apps/web`.
- **Decision:** do not create `apps/api`. A separate API project would require another deploy target and complicate auth/session sharing.
- **Defer marketing-site merge** until the community app is stable; keep `promptmetrics-website` on its own Vercel project for launch.

### Next.js App Router full-stack API
- Route handlers are the right fit for CRUD, agent loop, and MCP.
- **Explicit `export const runtime = 'nodejs'`** for all Drizzle-backed routes to avoid accidental Edge runtime breakage.
- Middleware should only validate session cookies and redirect missing-onboarding users; do not do heavy DB lookups there.
- **Caching rules:**
  - Public feed: `revalidate = 60`.
  - Authenticated feed, `/api/v1/me`, profile, flags: `export const dynamic = 'force-dynamic'`.
  - Mutations: never cache.
- **RSC pattern:** server components fetch initial data; client components subscribe to Realtime for inserts and handle optimistic UI.

### Supabase Pro EU region and compliance
- **Primary region:** `eu-central-1` (Frankfurt).
- **Vercel region:** set `vercel.json` to `"regions": ["fra1"]` for co-located functions.
- **Caveat:** Vercel is a US entity; `fra1` gives physical EU residency but not full jurisdictional sovereignty. Signed DPAs and SCCs are the practical mitigation.
- **Checklist:** upgrade to Pro, sign Supabase DPA, create production project in `eu-central-1`, enable RLS everywhere, turn on PITR/backups, configure OAuth providers, set egress alerts, sign Vercel DPA, document GDPR erasure procedures.

### Drizzle schema assessment
The draft schema is viable but needs indexes, FK hardening, counters, and expanded group access.

**Missing indexes to add:**
- `users`: `role`; case-insensitive unique on `lower(username)` and `lower(userslug)`.
- `groups`: `(visibility, created_at)`; slug already unique.
- `group_memberships`: `(user_id, role)`.
- `posts`: composite `(group_id, status, created_at)`; GIN on `tags`; full-text index on `content_plain`; index on `type`, `status`.
- `comments`: `(post_id, created_at)`; `(post_id, parent_comment_id, created_at)`.
- `reactions`: `(target_type, target_id)`; partial unique on `(user_id, target_type, target_id)`.
- `point_events`: `(user_id, awarded_at)`; `(event_type, awarded_at)`; partial unique on `(user_id, event_type, awarded_at::date)` for daily caps.
- `flags`: `(target_type, target_id, status)`.
- `invites`: `code` unique; `inviter_id`; `used_by_user_id`.

**Foreign-key / integrity fixes:**
- `posts.accepted_comment_id` must reference a comment on the same post. Add trigger or app check.
- `comments.parent_comment_id` `ON DELETE CASCADE` deletes subtrees; document the behavior.
- `flags.resolver_id` needs FK to `users(id)`.
- Add nullable `group_id` column to `point_events`; do not rely on JSONB `context` for group-scoped leaderboards.

**Denormalized counters (DB triggers, not read-modify-write):**
- `posts.upvotes` and `posts.comment_count` via triggers on `reactions` / `comments`.
- `users.reputation_score` via atomic `UPDATE ... SET reputation_score = reputation_score + N` in transaction.
- `groups.member_count` via trigger on `group_memberships`.
- `posts.view_count` via `post_views` log table aggregated periodically.

**RLS policy design:**
- Enable RLS on every table.
- `users`: public read of profile fields; self update; admin read-all.
- `groups`: public read for public groups; private/invite/paid groups read only by members/admins.
- `group_memberships`: self + group admins.
- `posts`/`comments`: read if public group or member; write own content; moderators update `status`.
- `reactions`: public read; insert/delete own only.
- `point_events`: read own only; leaderboard served by service-role aggregation.
- `flags`: read by moderators/admins; insert by authenticated users.
- `invites`: read by inviter/admin; accept via service logic.

**Group access expansion (currently under-specified):**
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
interval text default 'month'
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

Add a `group_invites` table with `group_id`, `code` unique, `inviter_id`, `max_uses`, `used_count`, `expires_at`, `role`.

### Gamification engine
- Use atomic SQL updates, not application-level read-modify-write.
- Wrap `INSERT point_events` and user score update in a transaction.
- Use unique constraints and partial indexes for idempotency per event type.
- Maintain a `user_scores` summary table via triggers for global and group-scoped leaderboards.
- Use a separate `user_daily_stats` table for `daily_visit` and `posts_read` caps instead of scanning `point_events`.

### Realtime and notifications
- Broadcast on `group:<slug>:posts`, `post:<id>:comments`, `user:<id>:notifications`.
- Add `posts`, `comments`, `notifications` to the `supabase_realtime` publication.
- Define a `notifications` table:
  ```sql
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,        -- comment, reaction, solution, invite, flag
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz default now()
  ```
- Treat the `notifications` table as source of truth; Realtime is a push layer. Rehydrate on reconnect.
- Pro includes 500 peak connections and 5M messages/month; at 10–50 active users this is ample, but monitor quotas.

### Build-vs-buy decisions
| Concern | Decision |
|---|---|
| Auth | Buy — Supabase Auth |
| Database | Buy — Supabase Postgres (Frankfurt) |
| Storage | Buy — Supabase Storage for avatars/attachments |
| Realtime | Buy — Supabase Realtime |
| Search | Defer Meilisearch/Algolia; start with Postgres full-text search |
| Rate limiting / cache | Buy — Upstash Redis |
| Email | Loops for transactional and lifecycle email |

### Key technical risks and mitigations
| Risk | Severity | Mitigation |
|---|---|---|
| Denormalized counters drift | High | DB triggers only |
| Gamification race conditions / duplicate points | High | Atomic updates + unique partial indexes + daily-cap table |
| App Router runtime mismatch with Drizzle | High | `runtime = 'nodejs'` on API routes |
| Agent / service-role key exposure | High | Store in Vercel env only; add API-key/signed-JWT gate for `/agent/*`; rate limit |
| OAuth users skip mandatory onboarding field | High | Post-auth redirect to `/register/complete`; block writes until `painful_tool_stack_task` is set |
| RLS policy complexity and performance | Medium | `EXPLAIN ANALYZE`; avoid nested subqueries |
| MCP SDK version confusion | Medium | Adopt v2 `createMcpHandler` from the start with dual-era support |
| Public-read spam / moderation | Medium | Auto-flag watched phrases + rate limits + human review queue |
| Vercel cold starts from wrong region | Medium | `regions: ["fra1"]` in `vercel.json` |
| EU legal sovereignty nuance | Medium | Signed DPA/SCCs; document jurisdictional limits |
| Paper-v3 app porting unknowns | Medium | Audit `web/app/lib/nodebb.ts`, providers, and profile page before estimating |
| Next.js 16 security patches | Medium | Pin to latest stable patch; enable Dependabot |

### First-week implementation sequence
T-shirt sizes: XS ≈ 0.5 day, S ≈ 1 day, M = 2–3 days, L = 4–5 days, XL > 1 week.

1. Repo & tooling — S
2. Supabase Pro EU project + Drizzle schema + migrations — M
3. Auth + onboarding enforcement — M
4. Core CRUD + feed endpoint — L
5. Frontend API client + profile port — M
6. Realtime + notifications — S
7. Gamification scoring — M
8. Moderation flags + watched phrases — S–M
9. QA + security pass — S

Current plan: **2-week internal alpha / 4–6 week production-grade closed-alpha launch with 10 devs**. (Original estimate: one dev **10–14 days**; 2–3 devs **7–10 days**.)

### Under-specified items most likely to break the build
1. Group access model uses visibility enum: public, invite_only, paid with optional required_tier_id.
2. `notifications` table is referenced but not defined.
3. Invite system: missing `code`, `group_id`, `max_uses`, `expires_at`.
4. Search strategy: not designed beyond `content_plain`.
5. File uploads / Storage RLS: mentioned but not designed.
6. Rate limiting and abuse prevention: absent.
7. Email provider and auth templates: not decided.
8. MCP deployment and SDK version: needs explicit decision.
9. `accepted_comment_id` integrity: no FK tying accepted comment to its post.
10. `point_events` group scoping: relies on JSONB `context`; add `group_id` column.

## MCP & Agent Interface Validation

### Deployment target
- **Recommendation:** start with a Next.js App Router API route at `app/api/mcp/route.ts` using `createMcpHandler` from `@modelcontextprotocol/sdk` (v2 alpha / 2026-07-28).
- This shares Drizzle/Supabase clients, auth helpers, and RLS logic with `/api/v1`.
- Vercel Pro function timeout (300 s) is acceptable if heavy tools are split into async jobs.
- **Mitigation:** instrument P95 latency per tool; if P95 > 2 s, split into "start job" + `community://jobs/{job_id}` resource.

### Recommended initial tool set
At least 8 tools, scoped and auditable:

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

### Recommended resources
- `community://leaderboards/{type}?group_slug={slug}&period={period}`
- `community://users/{slug}`
- `community://groups/{slug}`
- `community://posts/{id}`
- `community://feed?group_slug={slug}&tag={tag}&sort={sort}&page={page}`
- Resource templates:
  - `community://threads/{post_id}/summary`
  - `community://users/{slug}/reputation-history`
  - `community://jobs/{job_id}` for async heavy work

### Authentication model
- **Dual-token model:**
  - **Supabase JWT** for Paper-v3 UI and REST `/api/v1`.
  - **MCP OAuth 2.0 bearer token** for Claude Code / operator agents; decoded in `ctx.http.authInfo`.
- Scopes: `community:read`, `community:write`, `community:moderate`, `community:admin`, `community:system`.
- The MCP server acts as an OAuth Resource Server, not an Authorization Server; reuse Supabase Auth for user identity.
- Service-role key is held server-side only and used for cross-RLS operations such as global leaderboards; never accept it from a client.
- Every MCP-mediated mutation logs `agent_client_id` in `context` JSONB or a dedicated `agent_actions` audit table.

### How MCP relates to `/api/v1` REST
- Both interfaces call the same service layer.
- **REST only:** registration, login, OAuth callbacks, password reset, onboarding completion, file uploads, Realtime setup.
- **MCP preferred:** discovery, search, summarization, batch reads, moderation assistance.
- **Both, shared service functions:** create post/comment/reaction, join group, create invite, accept solution.
- Rule of thumb: if a human would click a button, expose it in REST; if an agent would "discover, decide, then act," expose it in MCP.

### Major MCP risks and mitigation
| Risk | Severity | Mitigation |
|---|---|---|
| MCP 2026-07-28 protocol still stabilizing | High | Use v1.x stable SDK with `createMcpHandler` dual-era support; isolate protocol code |
| Vercel function timeouts / streaming fragility | Medium | Keep tools under 5 s P95; async job pattern for heavy tools |
| Auth complexity: MCP OAuth + Supabase Auth | High | Treat MCP as OAuth Resource Server; document in `docs/MCP-AUTH.md` |
| Service-role key leakage or misuse | High | Never accept from clients; code-review every service-role query |
| Agent writes without clear attribution | Medium | Require `on_behalf_of_user_slug` + `community:system`; log `agent_client_id` |
| Over-building agent layer before user validation | High | Ship read tools first; add write/admin tools only after REST UI is live |
| Watched phrases auto-rejection | Medium | Default to `flag`, not `reject` |
| EU data residency for MCP traffic | Low | Pin Vercel to EU region; Supabase project in EU West |
| Rate-limit / cost surprise | Medium | 100 req/min per `clientId`; track token spend and duration |

### Concrete files to create
- `app/api/mcp/route.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/resources.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/audit.ts`
- `docs/MCP-AUTH.md`

## UX Pattern Recommendations

### From daily.dev
- Compact vertical feed cards: title preview, circle tag, author avatar + reputation badge + accepted-solution count, engagement counts, reading time. Consistent card heights.
- Reputation context next to every author name on cards and comments; clickable to profile.
- Squads → circles: persistent pill/bar with member count and "new" indicator; `/g/:slug` page lists rules and pinned resources.
- Top-10 leaderboard strip above feed for "Operator Stack quarterly" and "All-Time Operators" with explicit time window and scoring criteria.
- Like/heart action with count animation; cap daily like-giving points to prevent gaming.

### From Skool
- Pin a "Lessons" / "Pinned resources" section at the top of each circle page, separate from discussion feed.
- Group-scoped leaderboards in the right sidebar or sticky top of the circle page, refreshed weekly.
- Progress bar toward next badge/level in the user dropdown with exact thresholds.
- Dedicated invite modal with copyable links, role selection, and pending-invite list; visually separate invite-only and paid-tier circles with distinct lock icons.
- Bell notifications broken out by type: comments on your posts, accepted solutions, invite accepted, watched-phrase flags.

### Combined recommendations
- Card action bar: like, comment, share, save, "Ask author" — visible on hover/focus.
- Shareable "Operator DevCard": reputation, top circles, accepted-solution count.
- Search results display circle tag, accepted-solution badge, and author reputation.
- Seed each circle with 3–5 pinned canonical posts so new members see immediate value.
- Rich OpenGraph cards for public posts.

### Accessibility baseline
- WCAG 2.1 AA compliance on all surfaces.
- Semantic feed: `role="feed"` or list semantics, each card as `<article>`, clear heading hierarchy.
- Full keyboard-only signup → onboarding → create post → accept-solution flow with visible focus indicators.
- Focus management: Realtime inserts do not steal focus; use `aria-live="polite"`. Modals trap focus and return focus to trigger on close.
- 4.5:1 contrast for badges, tags, progress bars; do not rely on color alone.
- Honor `prefers-reduced-motion` for point animations, leaderboard updates, and realtime inserts.
- Screen-reader accessible author info: "Post by Alex Ríos, 1,240 points, 12 accepted solutions."
- Form labels, `aria-describedby` error links, required indicators.
- OAuth buttons: "Continue with GitHub," not just "GitHub."

## Open Questions

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
