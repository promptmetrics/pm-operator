# Roadmap: operator.promptmetrics.dev

**Target:** Ship an internal demo / alpha in 2 weeks, then a production-grade closed-alpha launch in 4–6 weeks with 10 developers.
**North star:** A free, EU-resident operator knowledge network where public-read content drives discovery, authenticated engagement builds reputation, and agent interfaces consume the same data as the UI.
**Constraint baseline:** Supabase Pro `eu-west-1`, Vercel Pro `fra1`, Next.js 16 App Router, Drizzle ORM, Upstash Redis, Loops email. Paid tiers exist in schema but are UI-inactive at launch.

---

## 1. Release Philosophy

1. **Parallel tracks, shared contracts.** Workstreams own vertical slices but converge on typed Zod contracts in `packages/api`, a single Drizzle schema in `packages/db`, and a shared design token system. No track ships a private API.
2. **Database-first, RLS-always.** Schema, indexes, triggers, and policies are the foundation. Frontend tracks build against mocked or seeded data until the schema is frozen by day 3.
3. **Human UI before agent UI.** `/api/v1` and community surfaces must be live and stable before the MCP route is feature-flagged on. Read tools ship in Phase 2; write/admin MCP tools ship only after moderation and attribution are proven.
4. **Scope is negotiable; the deadline is not.** If a feature threatens the 14-day MVP, it is deferred to Phase 2 or 3. The backlog explicitly lists deferred items so stakeholders see the trade-off.
5. **Ship internal demo / alpha on day 14.** The first 25–50 operators are invited to a closed alpha after production hardening in week 4–6, not on day 14.
6. **Measure from day one.** Every phase has a success gate. If a gate is missed, the team pauses, fixes the blocker, and only then advances.

---

## 2. Phase 0: Foundation (week 1, days 1–7) — parallel tracks for 10 devs

Goal: repo, schema, auth, contracts, CI/CD, seeded data, and a working local end-to-end flow (signup → onboarding → create post → comment → accept solution → leaderboard).

### Day 1 — kickoff and skeleton

| Track | Owner(s) | Deliverable by EOD |
|---|---|---|
| Infra / Monorepo | Infra lead + Frontend lead | `pnpm` + Turborepo skeleton; `apps/web`, `packages/{ui,db,api,mcp}`; TypeScript shared configs; ESLint/Prettier; CI checks on Vercel + GitHub. |
| Database | Backend lead + Gamification lead | `packages/db` scaffold with Drizzle config, first migration of `users`, `groups`, `posts`, `comments`, `reactions`, base indexes, RLS stubs. |
| Auth / Onboarding | Auth lead | Supabase `eu-west-1` project created (Pro); OAuth apps registered (GitHub, Google, LinkedIn); auth callback routes stubbed. |
| Design system | UI lead | Paper-v3 tokens ported to `packages/ui`; first reusable components: button, input, card shell, badge, avatar placeholder. |
| Contracts | API lead | `packages/api` Zod request/response contracts for user, group, post, comment, feed. |
| QA / Test harness | QA lead | Playwright + Vitest setup; first RLS smoke-test harness. |

### Day 2 — schema freeze and access model

| Track | Deliverable |
|---|---|
| Database | Complete schema: `membership_tiers`, `user_memberships`, `group_invites`, `point_events`, `user_scores`, `user_daily_stats`, `flags`, `watched_phrases`, `notifications`; all indexes and FK fixes from `03-concept-development.md`. Seed global sentinel group for user_scores FK. |
| Auth / Onboarding | Middleware redirect for missing `painful_tool_stack_task`; `/register/complete` page shell. |
| Backend API | `/api/v1/feed`, `/api/v1/groups`, `/api/v1/posts` route shells returning seeded JSON. |
| Frontend / UI | `/feed`, `/g/:slug`, `/p/:id` page shells wired to API contracts. |
| Infra | Vercel project linked; `vercel.json` with `regions: ["fra1"]`. |

### Day 3 — RLS policies v1 and contract integration

| Track | Deliverable |
|---|---|
| Infra / Security | RLS policies drafted for `users`, `groups`, `group_memberships`, `posts`, `comments`, `reactions`, `point_events`, `flags`, `invites`. RLS red-team review of users_update policy and admin-role elevation path. |
| Backend API | CRUD routes for posts and comments with RLS-aware service functions; visibility filter (`public`, `invite_only`, `paid`) enforced. |
| Frontend / UI | Feed card component, circle header, post detail shell. |
| Auth / Onboarding | OAuth flows end-to-end locally; onboarding form with `painful_tool_stack_task`; write-blocking until complete. |
| QA | First automated matrix: public vs invite-only group × member vs non-member read access. |

### Day 4 — reactions, invites, and gamification triggers

| Track | Deliverable |
|---|---|
| Gamification | Point event table + atomic award SQL; trigger updates `users.reputation_score`; partial unique indexes for idempotency; `user_scores` summary table; `user_daily_stats` for daily caps. |
| Backend API | Reaction endpoints; `group_invites` create/accept endpoints; `POST /api/v1/flags`. |
| Frontend / UI | Like button with optimistic UI; invite modal shell; moderation flag flow. |
| MCP / Agent | `app/api/mcp/route.ts` mounts with `createMcpHandler`; `ping` tool returns. |

### Day 5 — realtime, notifications, and search index

| Track | Deliverable |
|---|---|
| Realtime | Supabase Realtime publication for `posts`, `comments`, `notifications`; client subscriptions in feed and post detail; dedupe logic. |
| Notifications | `notifications` table + insert triggers on comment/reaction/solution/invite; bell badge. |
| Backend API | Postgres full-text search index on `posts.content_plain`; `/api/v1/search?q=` endpoint. |
| MCP / Agent | `search_posts` read tool wired to search service; P95 latency measured locally. |

### Day 6 — profile, leaderboard, and seed content

| Track | Deliverable |
|---|---|
| Frontend / UI | `/u/:slug` profile page; `/leaderboards` global and group-scoped pages; reputation badge component. |
| Gamification | Global and group-scoped leaderboard queries using `user_scores`; trigger updates `user_scores` on `point_events`. |
| Content / Seed | 20–30 seed posts across 4–5 circles (General, Show Your Build, MCP Servers, Vercel AI SDK, Multi-agent Orchestration); 3–5 pinned posts per circle; 10 seed users. |
| QA | Concurrency test: 100 concurrent reactions/comments; zero duplicate points, counters match. |

### Day 7 — integration, demo, and freeze

| Track | Deliverable |
|---|---|
| All tracks | Local end-to-end demo: anonymous read → signup → onboarding → create post → realtime comment → accept solution → point award → leaderboard update → search. |
| Infra | Staging deploy to Vercel; Supabase staging project seeded; env vars documented. |
| QA | Access-matrix tests pass; basic accessibility keyboard flow documented. |
| PM / Leads | Phase 0 success gate review; scope adjustments for Phase 1. |

**Phase 0 success gate:**
- Schema and RLS policies reviewed and frozen.
- Local demo completes without manual backend fixes.
- 100% of access-matrix smoke tests pass.
- Staging deploy loads and serves public pages without errors.
- No P0 bugs open.

---

## 3. Phase 1: MVP Build (week 2, days 8–14) and production cutover (weeks 4–6) — feature-complete core community

Goal: feature-complete community by day 14, followed by production hardening and a closed alpha launch in weeks 4–6.

### Day 8 — production provisioning and auth hardening

| Track | Deliverable |
|---|---|
| Infra | Production Supabase `eu-west-1` project provisioned for week 4–6 cutover; Vercel production project; Upstash Redis connected; Loops email configured. |
| Auth | Branded Loops transactional emails (welcome, password reset); OAuth scope copy finalized; rate limiting on auth routes. |
| Security | RLS policies reviewed and tightened; service-role key audit; env var checklist. |
| QA | Production smoke tests: signup, onboarding, public read, private group block. |

### Day 9 — feed polish and intent filters

| Track | Deliverable |
|---|---|
| Frontend / UI | Intent filters on `/feed`: My circles, Show Your Build, Solutions, Unanswered; sticky create-post action. |
| Backend API | Feed endpoint supports all filters with pagination; accepted-solution boost in search results. |
| Design system | Card action bar (like, comment, share, save, Ask author); hover/focus states; reduced-motion support. |
| QA | Cross-browser and mobile smoke tests. |

### Day 10 — circle experience and invite flow

| Track | Deliverable |
|---|---|
| Frontend / UI | `/g/:slug` complete: header, pinned resources/lessons, group leaderboard, discussion feed, invite modal, visibility badges. |
| Backend API | Invite code create/accept/revoke; role assignment (`member`, `moderator`); max uses and expiration enforced. |
| Content | Final seed content review; copy for "General" and "Design Partners" circles. |
| QA | Invite flow test: public join vs invite-only via code vs paid-tier block. |

### Day 11 — moderation, watched phrases, and admin queue

| Track | Deliverable |
|---|---|
| Backend API | Watched-phrase scan on post/comment insert; auto-flag only (no auto-reject); `/api/v1/moderation/queue`. |
| Frontend / UI | Moderation queue UI for admins/moderators; flag + suggest fix flow. |
| Security | New-user restrictions: posting limits until first accepted solution or 24-hour threshold. |
| QA | Flag pipeline test: trigger phrase → flag created → moderator sees queue. |

### Day 12 — profile, DevCard, and leaderboard

| Track | Deliverable |
|---|---|
| Frontend / UI | `/u/:slug` complete with reputation history; `/devcard` shareable card; global and group leaderboards. |
| Backend API | Reputation history endpoint; leaderboard endpoint with `rank()` window function. |
| Gamification | Badge thresholds defined and visible in UI; progress bar in user dropdown. |
| QA | DevCard OpenGraph smoke test. |

### Day 13 — performance, analytics, and launch prep

| Track | Deliverable |
|---|---|
| Infra | Vercel Edge caching for public pages; `dynamic = 'force-dynamic'` on authenticated routes; Redis rate limits active on all public and MCP endpoints. |
| Analytics | Basic Plausible/PostHog events: signup, onboarding complete, first post, first comment, solution accepted, search, invite accepted. |
| Backend API | `/api/v1/health` and `/api/v1/metrics` for monitoring. |
| Content / CS | FAQ draft; invite copy; moderator runbook. |
| QA | Load test: 50 concurrent users, 5 min; no 5xx, P95 API latency < 500 ms. Load test 100 concurrent reactions/comments; verify zero duplicate point_events and counter drift. |

### Day 14 — internal demo / alpha

| Track | Deliverable |
|---|---|
| PM / Leads | Internal demo / alpha invite list finalized (25–50 operators); closed-alpha candidate list for week 4–6 locked; go/no-go meeting. |
| Engineering | Feature flags configured; rollback runbook written; on-call rotation set. |
| Content | Announcement post in General circle; pinned "How to use Operator" lesson. |
| Support / CS | CS trained on flag flow and invite flow; escalation path documented. |
| QA | Final regression; production sanity checklist signed off. |

**Phase 1 success gate (day 14 — internal demo / alpha):**
- All internal demo / alpha participants can sign up, onboard, post, comment, accept solution, invite, and view leaderboards without P0/P1 bugs.
- Public pages render without auth and have correct OpenGraph.
- RLS matrix passes automated tests for public / invite-only / paid × member / non-member / admin.
- Rate limiting active on `/api/v1/*` and `/api/mcp`.
- 100% of seed circles have 3–5 pinned posts and at least 10 discussion posts.
- Rollback runbook and on-call roster published.

---

## 4. Phase 2: Hardening (weeks 3–4) — security, performance, analytics, MCP pilot

Goal: move from "it works" to "we trust it" and pilot the MCP read interface with a small Claude Code user group.

### Week 3 — security, performance, and reliability

| Track | Deliverable |
|---|---|
| Infra / Security | Supabase PITR decision (defer or enable); backup restore drill; egress alerts; Vercel DPA/SCC review documented. |
| Security | Full RLS policy audit; service-role query audit; dependency vulnerability scan; Dependabot enabled. |
| Performance | Query `EXPLAIN ANALYZE` pass; missing indexes added; N+1 eliminated from feed and leaderboard. |
| QA | Full access-matrix automated test suite expanded to include moderator and admin roles; concurrency load test for points and reactions. |
| Frontend / UI | Accessibility pass: WCAG 2.1 AA critical/serious issues fixed; keyboard-only flow validated. |
| Analytics | Dashboard live: WAU, signup-to-first-contribution, posts with accepted solutions, search click-through, invite acceptance. |

### Week 4 — MCP read-only pilot

| Track | Deliverable |
|---|---|
| MCP / Agent | Feature-flagged MCP route enabled for pilot users; OAuth token verification; 4 read tools live: `search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread`. |
| MCP / Agent | MCP resources: `community://users/{slug}`, `community://groups/{slug}`, `community://posts/{id}`, `community://leaderboards/{type}`. |
| Backend API | Summarization strategy for `summarize_thread` (LLM call or heuristic excerpt); P95 < 2 s or async job fallback. |
| Auth | `docs/MCP-AUTH.md` published; OAuth client registration process defined. |
| QA | MCP latency and access tests; no service-role key accepted from clients. |
| PM | Pilot with 5–10 Claude Code users; collect feedback; decide write/admin tool priority. |

**Phase 2 success gate:**
- Zero critical/serious accessibility issues.
- P95 API latency < 500 ms for feed/search; P95 MCP tool latency < 2 s.
- Automated RLS/access tests cover every visibility × role × auth combination.
- MCP read tools used successfully by pilot users with attribution and audit logging.
- No data leakage or duplicate-point incidents in production.

---

## 5. Phase 3: Growth (month 2+) — content, paid tiers, advanced features

Goal: convert the alpha into a sustainable knowledge network, validate paid circles, and deepen agent integration.

### Month 2 — content and community health

| Initiative | Owner | Deliverable |
|---|---|---|
| Weekly operator spotlight | Content / Community | 1 published profile + build teardown per week; cross-post to LinkedIn/X. |
| Circle expansion | Content / Community | Add 2–3 intent-based circles (Evals & Benchmarking, Cost Optimization, Governance & AI Act). |
| Onboarding optimization | PM + Frontend | A/B test `painful_tool_stack_task` framing; target 70% completion. |
| Search relevance benchmark | Backend | 75% of test queries return an accepted-solution post in top 3. |
| First paid membership design | PM + Backend | Stripe integration design; paid-tier UI gating; decision to enable or keep deferred. |

### Month 3 — agent and integration depth

| Initiative | Deliverable |
|---|---|
| MCP write tools (scoped) | `create_post_reply`, `flag_post`, `create_invite` with `on_behalf_of_user_slug` and `community:system` scope. |
| REST parity completion | `/api/v1` covers remaining surfaces: settings, moderation bulk actions, analytics exports. |
| Skill-to-community loop | Link PromptMetrics skills/runbooks to circle pinned resources; agent can query both. |
| Mobile PWA | Service worker, install prompt, offline read of recent feed. |

### Month 4–6 — scale and monetization

| Initiative | Deliverable |
|---|---|
| Paid circles | Enable first PromptMetrics-owned paid tier and gated circle if organic demand exists. |
| Advanced analytics | Cohort retention, contributor funnel, support deflection tracking. |
| Search upgrade | Decision: stay on Postgres or migrate to Meilisearch/Algolia if scale/query volume warrants. |
| Marketing-site integration | Migrate `promptmetrics-website` into monorepo and unify auth if DNS/community integration is proven. |
| Community moderation scale | Moderator nomination flow, trusted-user permissions, bulk moderation actions. |

**Phase 3 success gate:**
- 100+ WAU or equivalent engaged operator base.
- 35% signup-to-first-contribution within 7 days at launch scale; 50% by month 6.
- Agent API calls > 100/week by month 2, growing 20% MoM.
- Clear signal on paid-circle demand (10+ users asking or 1 cohort ready to pay).

---

## 6. Backlog (RICE)

Items are scored for the MVP-to-Phase 2 window. Reach = operators/quarter; Impact = 0.25–3; Confidence = %; Effort = person-weeks.

| # | Initiative | Reach | Impact | Confidence | Effort | RICE | Priority | Phase |
|---|---|---:|---:|---:|---:|---:|:---:|---|
| 1 | Supabase Auth + mandatory onboarding | 200 | 3 | 90% | 2 | 270 | Must | Phase 0 |
| 2 | Core CRUD + feed + group access | 200 | 3 | 90% | 3 | 180 | Must | Phase 0–1 |
| 3 | RLS policies + access matrix tests | 200 | 3 | 80% | 2 | 240 | Must | Phase 0–1 |
| 4 | Gamification engine (points, leaderboards, caps) | 200 | 2 | 80% | 2 | 160 | Must | Phase 0–1 |
| 5 | Realtime posts/comments/notifications | 150 | 2 | 80% | 1 | 240 | Must | Phase 0–1 |
| 6 | Search endpoint (Postgres FTS) | 150 | 2 | 80% | 1 | 240 | Should | Phase 1 |
| 7 | Invite-only group flow | 100 | 2 | 85% | 1 | 170 | Must | Phase 1 |
| 8 | Moderation flags + watched phrases | 150 | 2 | 80% | 1.5 | 160 | Must | Phase 1 |
| 9 | Profile + leaderboards UI | 150 | 2 | 85% | 2 | 128 | Must | Phase 1 |
| 10 | MCP read tools (4 tools) | 50 | 2 | 60% | 2 | 30 | Should | Phase 2 |
| 11 | DevCard + OpenGraph sharing | 100 | 1.5 | 80% | 1 | 120 | Should | Phase 1 |
| 12 | Rate limiting + abuse prevention | 200 | 2 | 85% | 1 | 272 | Must | Phase 1 |
| 13 | Accessibility WCAG 2.1 AA pass | 50 | 2 | 75% | 1.5 | 50 | Must | Phase 1 |
| 14 | Paid membership tiers (schema + UI off) | 50 | 2 | 50% | 1.5 | 33 | Could | Phase 1 schema / Phase 3 enable |
| 15 | MCP write/admin tools | 30 | 2 | 50% | 2 | 15 | Could | Phase 3 |
| 16 | Meilisearch/Algolia migration | 100 | 2 | 60% | 3 | 40 | Could | Phase 3 |
| 17 | Marketing-site monorepo merge | 50 | 1 | 70% | 2 | 18 | Won't (launch) | Phase 3 |
| 18 | Native mobile app | 50 | 1.5 | 40% | 8 | 4 | Won't (launch) | Phase 3+ |

**MoSCoW summary**

- **Must (MVP launch):** Auth + onboarding, core CRUD + feed, RLS + access tests, gamification, realtime, invite-only groups, moderation flags, rate limiting, profile/leaderboards UI, search endpoint, accessibility pass.
- **Should (Phase 2):** MCP read tools, DevCard sharing, analytics dashboard.
- **Could (Phase 3):** Paid tiers enabled, MCP write tools, Meilisearch, PWA, advanced analytics.
- **Won't (launch):** Marketing-site monorepo merge, native mobile app, full admin UI, advanced personalization algorithms.

---

## 7. Dependency Map

```text
Day 1–2: Repo + Schema
    |
    |--> Day 2–3: RLS policies v1
    |         |
    |         |--> Day 3–5: Backend CRUD + feed (depends on RLS + schema)
    |         |
    |         |--> Day 3–4: Frontend page shells (depends on API contracts)
    |
    |--> Day 2–4: Auth + onboarding (depends on schema users table)
    |         |
    |         |--> Day 4–7: Frontend forms + middleware (depends on auth)
    |
    |--> Day 4: Gamification schema (depends on users, groups, posts, comments, reactions)
    |         |
    |         |--> Day 5–7: Leaderboards + point awards (depends on gamification)
    |
    |--> Day 4–5: MCP route scaffold (depends on API contracts)
    |         |
    |         |--> Phase 2: MCP read tools (depends on stable REST + search + auth)
    |
    |--> Day 5–6: Realtime + notifications (depends on posts/comments tables)
    |
    |--> Day 6: Seed content (depends on working create flows or direct SQL seed)
    |
    |--> Day 7: End-to-end demo (depends on auth, feed, post, comment, points, leaderboard)
```

### Critical path

1. Schema freeze (day 2)
2. RLS policies v1 (day 3)
3. Backend CRUD + feed (days 3–5)
4. Frontend page shells + auth integration (days 4–6)
5. Gamification triggers + leaderboards (days 5–6)
6. End-to-end demo (day 7)
7. Internal demo / alpha (day 14) and production cutover (week 4–6)

### Cross-track contracts

- `packages/db` is the single source of truth. No track adds columns without schema review.
- `packages/api` Zod contracts are frozen by day 3 for v1 surfaces; additions go through a 15-min API review.
- `packages/ui` components are theme-only; page-level logic lives in `apps/web`.
- MCP tools must call the same service functions as REST; no duplicate business logic.

---

## 8. Team Allocation (10 developers across workstreams)

| Workstream | Devs | Responsibilities per phase |
|---|---|---|
| **Backend API** | 2 | Schema, CRUD, feed, search, groups, posts, comments, reactions, invites, flags, moderation queue API, service-layer functions shared with MCP. |
| **Frontend / Community UI** | 2 | `/feed`, `/g/:slug`, `/p/:id`, `/u/:slug`, `/leaderboards`, `/settings`, `/moderation`, realtime subscriptions, optimistic UI, responsive layout. |
| **Auth / Onboarding** | 1 | Supabase Auth, OAuth callbacks, middleware, `/register/complete`, onboarding form, Loops email integration, rate-limited auth routes. |
| **Gamification** | 1 | Point events, atomic transactions, triggers, `user_scores`, `user_daily_stats`, leaderboards, badge thresholds, anti-gaming logic. |
| **MCP / Agent** | 1 | `app/api/mcp/route.ts`, `createMcpHandler`, read tools, resources, OAuth token verification, audit logging, feature flag wiring. |
| **Infra / Security / DevOps** | 1 | Supabase Pro EU project, Vercel `fra1`, CI/CD, env vars, Redis rate limits, RLS policy review, service-role key hygiene, monitoring/alerting. |
| **QA / RLS Testing** | 1 | Automated RLS/access matrix tests, load/concurrency tests, Playwright E2E, accessibility checks, regression before each phase gate. |
| **Content / Seed / Design System** | 1 | Paper-v3 token/component port, seed content, operator spotlights, moderator runbook, invite copy, FAQ, closed-alpha outreach support. |

### Suggested pair rotations

- Backend API + Gamification pair closely on triggers and service-layer point awards.
- Frontend / UI + Auth pair on onboarding flow and middleware redirects.
- MCP / Agent + Backend API pair on shared service functions and search.
- Infra / Security + QA pair on RLS test matrix and production hardening.

---

## 9. Milestones and Success Gates

| Milestone | Date | Success gate | Owner |
|---|---|---|---|
| Repo + schema skeleton | Day 1 | `pnpm dev` works; first Drizzle migration runs locally. | Infra lead |
| Schema + RLS freeze | Day 3 | Schema reviewed; RLS policies v1 for all tables; access-matrix smoke tests pass. | Backend lead + Security lead |
| Local end-to-end demo | Day 7 | Anonymous read → signup → onboarding → post → comment → accept solution → leaderboard works locally with no P0 bugs. | PM |
| Production cutover | Week 4–6 | Production Supabase/Vercel projects provisioned; env vars documented; production smoke tests pass; production cutover from staging. | Infra lead |
| Feature-complete MVP | Day 12 | All Must backlog items implemented in production; closed-alpha checklist 90% complete. | PM + Eng lead |
| Internal demo / alpha | Day 14 | 25–50 operators participate in end-to-end demo; go/no-go for week 4–6 closed alpha. | PM |
| Closed alpha launch | Week 4–6 | 25–50 operators invited; first posts and comments from real users; rollback runbook live. | PM |
| Hardening complete | Week 4 | WCAG AA critical issues fixed; MCP read pilot live; P95 latency targets met. | QA lead + MCP lead |
| Growth decision point | Month 2 | WAU, contribution, and agent API usage targets reviewed; paid-circle demand signal assessed. | PM |

**Launch targets (from `03-concept-development.md` and `04-feasibility-analysis.md`)**

| Metric | Launch target | Month 6 target | Owner |
|---|---|---|---|
| Signup-to-first-contribution within 7 days | 35% | 50% | PM |
| Onboarding completion rate | 70% | — | PM |
| Posts with accepted solutions | 25% of answered posts | — | Community lead |
| Average time to first helpful reply | < 6 hours | — | Community lead |
| WAU | 25–50 | 100+ | PM |
| Posts/replies per active user/week | > 2 | > 3 | PM |
| Search click-through rate | > 40% | > 50% | PM |
| Invite acceptance rate | > 60% | > 60% | PM |
| MCP/REST API calls/week | 0 (MVP) | 100+ | MCP lead |
| Support ticket deflection | baseline | −20% within 90 days | Support lead |
| Cost per active user | < $2 | < $2 | PM |
| WCAG 2.1 AA audit | zero critical/serious | zero critical/serious | QA lead |

---

## 10. Open Risks and Contingencies

| Risk | Likelihood | Impact | Contingency / Trigger |
|---|---|---|---|
| MCP v2 alpha breaks mid-build | Medium | High | Pin SDK version; wrap route in `MCP_ENABLED` feature flag; fallback to REST-only agent access if route cannot be stabilized by Phase 2. |
| RLS policy bug leaks private content | Medium | Very High | Automated access-matrix tests required before production cutover; manual red-team review of invite-only and paid groups; hotfix rollback runbook. |
| Gamification race conditions / duplicate points | Medium | High | DB triggers only; atomic transactions; unique partial indexes; `user_daily_stats` caps; load test on day 6; freeze point logic after day 7. |
| Frontend port of Paper-v3 takes longer than estimated | Medium | High | Cut scope to core pages only (feed, group, post, profile, leaderboard); defer DevCard and admin UI polish to Phase 2. |
| Onboarding drop-off exceeds 30% | Medium | High | A/B test framing in Phase 1; fallback to optional onboarding if completion drops below 50%. |
| Empty-room problem at alpha launch | High | High | Seed 30+ posts before inviting; require founding members to post weekly for first month; host first office hour within 48 hours of invite. |
| LinkedIn OAuth instability | Low | Medium | Launch with GitHub + Google; add LinkedIn later if it blocks users. |
| Vercel/Supabase region mismatch or cold starts | Low | Medium | Confirm `fra1` + `eu-west-1`; monitor latency; add Edge caching for public pages. |
| Paid-tier schema confusion delays launch | Low | Medium | Keep `membership_tiers`/`user_memberships` in schema but hide paid UI; paid gating is a day-1 schema decision, not a day-1 product feature. |
| Team coordination overhead with 10 parallel tracks | Medium | Medium | Daily 15-min standup; frozen contracts by day 3; async status updates; PM resolves blockers within 24 hours. |
| Realtime message quota or at-least-once delivery issues | Low | Medium | Monitor Pro quota (500 peak connections, 5M messages/mo); client dedupe and `notifications` rehydration handle duplicates. |
| Search relevance disappoints users | Medium | Medium | Postgres FTS is launch baseline; if > 30% of searches lead to no click by week 3, fast-track Meilisearch spike. |
| Timeline compression risk if stakeholders push for public launch before hardening | Medium | High | Enforce 4–6 week production target; do not cut RLS/access-matrix tests or accessibility pass. |

**Rollback criteria for closed-alpha launch**

- Error rate > 1% for 10 minutes.
- Any confirmed private content visible to non-members.
- Signup or onboarding flow broken for > 1 hour.
- Database counter drift or duplicate point events detected.

If any trigger fires: disable feature flags, revert to last known good Vercel deployment, page on-call, and notify closed-alpha users via email within 1 hour.

---

**PRD is specs/05-prd.md.**
