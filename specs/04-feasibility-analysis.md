# Feasibility Analysis: operator.promptmetrics.dev

> **Historical context:** This document captures early-phase thinking. Canonical decisions have evolved. See /Users/izzy/Documents/pm-operator/specs/SPEC_LOG.md and the latest specs (05-prd.md, 06-technical-spec.md, 07-ux-spec.md, 08-roadmap.md) for current decisions.

## Strategic Fit & Why Build This

PromptMetrics should build `operator.promptmetrics.dev` as a **strategic signal and trust asset**, not a revenue center.

- **Capture institutional knowledge that currently lives in Slack/Discord.** Answers become persistent, searchable, and linkable, so the same question stops being answered from scratch.
- **Create a reputation graph of trusted AI operators.** Points/leaderboards surface power users who can become design partners, case studies, champions, and beta testers.
- **Build intent-based circles around real use cases.** Grouping by problem (e.g., evals, cost optimization, agent deployment) gives the product team higher-fidelity feedback than a single noisy forum.
- **Establish PromptMetrics as agent-ready infrastructure.** Shipping a public REST + MCP API first signals that PromptMetrics data is meant to be consumed by tools, not just humans.
- **Controlled access protects IP while allowing public thought leadership.** Public-read + gated private groups let outsiders see value without exposing customer-sensitive threads.

The near-term business case is **reduced support cost, faster product learning, and a loyal expert community** that reinforces the PromptMetrics brand. This fits PromptMetrics because it already has a free operator community, open-source skills that need validation, and a consulting/cohort business that benefits from proof and trust.

## Lightweight Business Model

**Recommendation: free core (Option A) as the default, with paid private circles (Option B) as a future controlled experiment.**

| Option | What it means | Pros | Cons |
|--------|---------------|------|------|
| **A. Free core community** | Public knowledge, reputation, and circles cost nothing. | Maximizes adoption, SEO, and trust; aligns with strategic intent. | Direct revenue is zero; requires ongoing operational investment. |
| **B. Paid membership tiers** | PromptMetrics sells membership tiers that unlock access to specific circles, premium content, or cohorts (`groups.required_tier_id`). | Monetizes high-intent operators; uses existing group access model. | Risk of fragmenting the community if too much value is gated; payment integration deferred. |
| **C. Services tie-in** | Members book implementation/consulting with PromptMetrics experts or partners. | Captures enterprise leads naturally; high margin. | Requires sales capacity; can feel transactional if overdone. |
| **D. Sponsorship / job board** | Vendors or recruiters pay for placement. | Low-friction revenue. | Erodes trust if ads are not tightly curated; misaligned with operator ethos. |

- Keep the main community **free and public-read** to maximize network effects at launch.
- Build the data model for **paid membership tiers** from the start (`membership_tiers`, `user_memberships`, `groups.required_tier_id`), but do not expose paid gating in the UI until the first paid cohort is defined.
- Reserve paid tiers for clearly premium experiences (e.g., a private enterprise AI ops cohort, monthly AMAs, certified implementation circles).
- Defer sponsorship and job board until 500+ active members and a clear moderation/relevance policy exist.

**Correction:** Paid tiers are PromptMetrics-owned memberships that unlock access to specific circles, not a feature for users to create and monetize their own communities.

Commercial validation has not been run, so this recommendation is based on **strategic fit and optionality**, not willingness-to-pay data.

## Go-to-Market & Acquisition

At 10–50 users, acquisition should be **manual, high-context, and invite-only**.

**Channels:**
1. **PromptMetrics customer base** — invite 5–10 power users and founders already using the product.
2. **Founder/team networks on LinkedIn and X** — short posts plus direct outreach to 20–30 relevant operators.
3. **Existing AI operator communities** — thoughtful participation in Slack/Discord groups with links to public threads, not bulk invites.
4. **Referral invites from founding members** — give each seed member 3–5 invite codes.
5. **Small live events** — one 30-minute AMA or MCP API demo can convert 10–20 highly relevant users.
6. **Technical content** — blog posts on MCP/REST design, gamification, or NodeBB migration; share on Hacker News, Reddit r/LocalLLaMA, and X.

**Target first 50:** founders, AI leads, and senior ICs at teams with a real AI mandate, not general AI enthusiasts.

**Go-to-market phases:**

- **Phase 0 — Seed (days 1–7):** Populate 20–30 seed posts; invite the PromptMetrics team and 5 design partners; start with one public "General" and one private "Design Partners" group.
- **Phase 1 — Closed alpha (days 8–14):** Invite ~25 target operators; run one weekly office hour; tune points/reputation quietly.
- **Phase 2 — Public read, invite-only participation (week 3–4):** Flip public visibility on for key threads; announce via LinkedIn/X, email list, and a blog post.
- **Phase 3 — Sustain (month 2+):** Publish weekly operator spotlights; release MCP demos; launch the first paid membership tier and its gated circle only if organic engagement and clear premium demand exist.

**Success metrics:**

| Metric | Why it matters | Target direction |
|--------|----------------|------------------|
| **Weekly active operators (WAU)** | Measures real engagement, not raw signups. | Up |
| **Posts/replies per active user per week** | Indicates production vs. lurking. | > 2 actions/user/week |
| **Repeat search rate** | Validates reusable knowledge. | > 40% of searches lead to a click |
| **Support ticket deflection** | Threads replacing support questions. | -20% relevant tickets within 90 days |
| **Product insights captured** | Tagged feature requests, case studies, bugs. | ≥ 10/month |
| **Invite acceptance rate** | Quality signal for founder-led acquisition. | > 60% |
| **MCP/REST API usage** | Adoption of the agent-ready data layer. | > 100 calls/week by month 2 |
| **Trusted-user distribution** | Champions surfaced by reputation. | Top 10% drive 50% of replies |
| **NPS/CSAT of active members** | Long-term health and word-of-mouth. | > 40 NPS |
| **Cost per active user** | Ensures strategic asset does not bleed cash. | < $2/active user at launch scale |

## Technical Feasibility

**Scope:** Replace the NodeBB backend with a purpose-built Next.js 16 + Supabase + Drizzle community platform, reuse the Paper-v3 frontend, and expose REST + MCP read interfaces.

**Stack verdict:** technically viable, but not a "boring" stack.

| Component | Maturity | Feasibility | Critical Caveats |
|---|---|---|---|
| **Next.js 16 App Router** | Stable since Oct 2025 | Feasible | Node 20+ and ESM-only. Pin `runtime = 'nodejs'` on Drizzle-backed routes to avoid Edge-runtime breakage. Track security patches. |
| **Supabase Pro (Postgres, Auth, Realtime, Storage)** | Production-grade | Feasible | Region cannot be changed after creation; choose `eu-central-1` day one. RLS is powerful but the most likely source of bugs and performance issues. |
| **Drizzle ORM + Drizzle Kit** | Stable, type-safe | Feasible | Works well with Node.js route handlers. Strictly separate `packages/db` from Next.js imports. Migrations and RLS policies must be reviewable in Git. |
| **Supabase Auth (OAuth + email/password)** | Mature | Feasible | LinkedIn OAuth is less battle-tested than GitHub/Google. Mandatory `painful_tool_stack_task` must be enforced in middleware and API. |
| **Supabase Realtime** | Mature for push | Feasible at 10–50 users | At-least-once delivery, no cross-channel ordering, 500 connection / 5M message cap on Pro. Clients must dedupe and rehydrate from `notifications` table. |
| **Upstash Redis** | Mature serverless Redis | Feasible | Free tier (256 MB, 10 GB bandwidth, 500K commands/mo) covers rate limiting. Watch command cost if used beyond simple fixed-window limits. |
| **Loops** | Mature SaaS email | Feasible | Free tier: 1,000 contacts / 4,000 sends/mo. Good for launch; marketing volume can push to Starter ($49/mo). |
| **MCP SDK v2 alpha (`createMcpHandler`)** | **Beta / RC for 2026-07-28 protocol** | Feasible but high risk | Least-mature piece. ESM-only/Node 20+, sparse examples, API may shift. Dual-era default helps, but it is not a stable foundation. |

**Build-vs-buy split:**

| Concern | Decision | Rationale |
|---|---|---|
| Identity, OAuth, sessions, password reset | **Buy — Supabase Auth** | Mature, supports required providers, RLS-aware. |
| Relational database, backups, extensions | **Buy — Supabase Postgres** | Managed Postgres in `eu-central-1`, backups, RLS, `pg_trgm`, full-text search. |
| File / avatar / attachment storage | **Buy — Supabase Storage** | Signed URLs, RLS on buckets, CDN egress included. |
| Live feed / comment / notification push | **Buy — Supabase Realtime** | Avoids self-hosting WebSocket infrastructure. |
| Rate limiting / short-lived cache | **Buy — Upstash Redis** | Serverless Redis with free tier sufficient for launch. |
| Email delivery + templates | **Buy — Loops** | Transactional and lifecycle email; free tier fits launch. |
| Hosting, CDN, preview deploys | **Buy — Vercel Pro** | Fits Next.js 16 lifecycle; pin `fra1` for EU latency. |
| Community UI, feed, circles, onboarding | **Build** | This is the product differentiator. |
| Gamification engine (points, leaderboards, caps) | **Build** | Needs domain-specific rules and anti-gaming logic. |
| Group access model (`visibility` + invites + paid gating) | **Build** | Core IP; no SaaS gives the exact public-read / invite-only / paid matrix needed. |
| Moderation queue + watched phrases | **Build** | Auto-flag-only policy and operator-specific phrase list are custom. |
| MCP read tools | **Build** | The agent interface is a differentiator; keep it thin and read-only at launch. |
| Search relevance / typo-tolerance at scale | **Defer / Buy later — Meilisearch or Algolia** | Postgres search is enough for 10–50 users and thousands of posts. |

The platform is mostly **buy the boring infrastructure, build the domain logic**. That is the right split for a small team.

## Team & Effort Estimate

> **Note:** The team-size and timeline estimates below were written for 1–3 devs. The current plan is **10 devs** with a **2-week internal alpha** and a **4–6 week production-grade closed-alpha launch**.

**Original estimate of 10–14 days for one senior full-stack dev is optimistic.** A realistic MVP including frontend porting, RLS testing, and a security pass looks closer to this:

| Area | Size | Days | Notes |
|---|---:|---:|---|
| Repo & monorepo tooling | S | 1 | Straightforward if the team has used Turborepo before. |
| Supabase Pro EU project + Drizzle schema + migrations + indexes + FK fixes | M | 3–4 | Includes `visibility` enum, `group_invites`, `notifications`, `user_scores`, `user_daily_stats`, and RLS stubs. |
| Auth + onboarding enforcement | M | 3–4 | LinkedIn OAuth and post-auth interstitial are the main unknowns. |
| Core CRUD + feed endpoint | L | 5–7 | Postgres full-text search + `pg_trgm`; feed filters and group access matrix need careful testing. |
| Frontend API client + profile/group port | L | 4–6 | Replacing `web/app/lib/nodebb.ts` is easy; adapting profile page and `/g/:slug` layouts is where time hides. |
| Realtime + notifications | S/M | 1–2 | Wiring is fast; dedupe-safe UX takes the extra day. |
| Gamification engine | M | 3–5 | Triggers, unique partial indexes, and `user_daily_stats` must be load-tested. |
| Moderation flags + watched phrases + admin queue | S/M | 2–3 | Auto-flag only is right, but the queue UI still needs triage and bulk actions. |
| MCP read tools + auth + resources | M | 3–5 | `summarize_thread` needs a summarization strategy. MCP OAuth Resource Server wiring is non-trivial. |
| QA, RLS/security tests, rate limits, accessibility pass | M | 2–4 | Every visibility × membership × role combination needs an automated test. |

**Realistic totals:**
- **One senior full-stack dev:** 25–37 days (≈5–7 weeks elapsed).
- **Two devs (backend + frontend):** 12–18 days.
- **Three devs:** 10–14 days if scope is strictly limited to read-only MCP, no admin UI polish, and no marketing-site merge.

**Minimum viable team for the full MVP in 2–3 weeks:**
- **1 senior full-stack engineer** — owns backend, database design, and MCP integration.
- **1 strong frontend engineer** — owns API client replacement, feed/group UI, and realtime UX.
- **0.25–0.5 QA / infra support** — RLS test matrix, OAuth validation, and security review.

**Not needed at launch:** dedicated DevOps engineer, separate mobile developer, or search/relevance engineer.

## Infrastructure Costs (6 months)

At 10–50 active users:

| Service | Monthly | 6 Months | Notes |
|---|---:|---:|---|
| **Supabase Pro** (org fee + $10 compute credit covering one Micro project) | ~$25 | $150 | Micro compute covered by included credit. Storage and egress included. |
| **Vercel Pro** (1 deploying seat) | $20 | $120 | Seat includes $20 usage credit. Launch scale should fit. |
| **Upstash Redis** free tier | $0 | $0 | 256 MB, 10 GB bandwidth, 500K commands/mo. |
| **Loops** free tier | $0 | $0 | 1,000 contacts / 4,000 sends/mo. |
| Domain / DNS | ~$1 | ~$6 | Negligible. |
| Buffer for overages / trials | — | ~$30 | 20% contingency. |
| **Total baseline** | **~$45** | **~$270–$300** | |

**Defer:** Supabase PITR backups ($100/mo), Loops Starter ($49/mo), larger Supabase compute.

The Pro-tier decision is financially trivial at launch. The main cost is team time, not infrastructure.

## Competitive Positioning

`operator.promptmetrics.dev` is not a broad community platform; it is a niche **agent-native knowledge and reputation network** for operators, founders, and teams with an explicit AI mandate. Its differentiation is the intent and data model, not the feature list.

| Competitor | What it actually is | Where `operator` can win | Where it will lose |
|---|---|---|---|
| **Skool** | $9–$99 flat-fee creator community + light courses + gamification feed | Operators want substance, not course hype; purpose-built search/reputation beats Skool’s feed. | Skool’s $9 price, native mobile app, discovery marketplace, and simple-launch UX are hard to beat. |
| **Circle.so** | $89–$199+ all-in-one community/course/events platform; has **Circle MCP** (read+write Admin API v2) on Business+ | Circle is horizontal; `operator` can go deeper on operator workflows, governed skills, and intent-based circles. | Circle already ships native apps, SSO, payments, automations, branded apps, and a comparable MCP layer. |
| **daily.dev** | Developer news feed + public Squads + reputation (DevCard, streaks) | Operator audience is more practitioner than news consumer; private paid circles and intent gating fit real mandates. | daily.dev owns the developer discovery habit; 1,300+ source feeds and mobile/PWA distribution. |
| **Discord** | Free real-time chat/rooms/bots for high-energy groups | Persistent, searchable knowledge + reputation graph beats Discord’s content graveyard. | Discord owns real-time culture, voice, and bots; operators already live there for quick help. |
| **LinkedIn Groups** | Free professional networking inside the LinkedIn graph | Operator identity based on shipped work > job title; controlled access + agent-ready data beats LinkedIn’s weak tools. | LinkedIn has the professional graph, targeting, and no cost; group engagement is low but distribution is huge. |
| **Discourse** | Open-source, SEO-first, trust-level forum; has official `@discourse/mcp` | Custom operator-first UX, paid gating, and integration with PromptMetrics skills. | 15+ years of moderation maturity, plugins, hosting, and first-class MCP; hard to out-forum. |
| **NodeBB** | Modern real-time forum being replaced | Replacing NodeBB is rational if it lacks the UX, MCP, and monetization layer wanted. | Already self-hostable/extensible; migration cost must buy something genuinely better. |

**Bottom line:** Feature gaps are smaller than they look. Circle and Discourse already have MCP servers. Skool and Discord own the low-friction social layer. `operator` wins only if the **combination** of operator-specific intent circles, reputation, and PromptMetrics skill integration creates a workflow competitors cannot copy without rebuilding around the same niche.

## Defensibility & Moats

1. **Skill-data flywheel.** If community discussions become training/validation data for PromptMetrics’ governed skills, the platform becomes the field lab where operators test and improve skills.
2. **Reputation as a signal, not vanity.** A reputation graph built on shipped work, peer validation, and skill quality is more valuable to hiring/founding teams than LinkedIn endorsements or Skool points.
3. **Agent-ready structured data as a first-class product.** Circle and Discourse bolt MCP onto existing schemas. `operator` can design posts, profiles, leaderboards, and circles as native MCP resources from day one, with tools like `summarize_thread` tuned to operator workflows.
4. **Trust + compliance positioning.** PromptMetrics already leads with human-in-the-loop, EU data residency, and audit-trailed governance. That can matter to regulated operators evaluating a community platform.
5. **Paid circles around real team mandates.** Gated private groups tied to actual workflows (RevOps, CS, founder AI mandate) can create strong network density if a few high-quality teams anchor them.

**Reality check:** None of these are durable yet. They become moats only after the platform reaches critical mass in a specific operator segment.

## Vulnerabilities

- **MCP parity is already here.** Circle MCP and Discourse MCP expose broad read+write tools. “MCP server included” is table stakes, not a lasting differentiator.
- **No native mobile app.** Operators will still open Discord/Slack/LinkedIn on their phones. A PWA is not enough at launch.
- **Switching cost is low for members.** A community is sticky only because of the people and knowledge inside it. Convincing them to relocate from Skool/Discord is hard.
- **Discovery problem.** Skool has a marketplace; LinkedIn has the graph; daily.dev has the feed. `operator` must build distribution from the existing free Operator Stack audience.
- **Timeline is optimistic.** 10–14 days for one full-stack dev to ship Next.js 16 + Supabase + Drizzle + MCP + gamification + payments is unrealistic for production reliability. Expect 6–10 weeks for something you can confidently charge for.
- **Maintenance burden.** Supabase Pro + Vercel Pro + Upstash + Loops + MCP SDK v2 alpha means ongoing infra cost and breakage risk on a bleeding-edge SDK.
- **Moderation at scale.** Watched-phrase auto-flagging is fine for launch, but will not stop coordinated spam or bad-faith actors once public.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Empty-room problem** | High | High | Seed 20–30 threads manually before inviting anyone; require founding members to post weekly for the first month. |
| **Quality dilution after opening** | Medium | High | Keep invite-only posting until reputation system is calibrated; use auto-flagged watched phrases for moderation queue, not auto-removal. |
| **Existing Slack/Discord remains primary hub** | Medium | High | Host exclusive content and events on the new platform only; use bridge integration later to pull content in, not push it out. |
| **MCP v2 alpha instability** | Medium | High | Pin SDK version, isolate MCP route behind a feature flag, and prepare fallback to REST-only if SDK changes break compatibility. |
| **Private content leak via auth bug** | Low | Very High | Thoroughly test group visibility permissions; never mix public and private data in the same query without visibility checks. |
| **Operational overhead exceeds team capacity** | Medium | Medium | Scope launch to core flows only; one PM/designer/community lead must own engagement, not just engineering. |
| **Infrastructure costs outgrow launch tier** | Low | Medium | Monitor Supabase/Vercel dashboards weekly; Upstash free tier should cover launch, but set usage alerts. |
| **Gamification race conditions / duplicate points** | Medium | High | Use DB triggers for counters; wrap point awards in transactions; enforce unique partial indexes per event type; use `user_daily_stats` for caps; load-test concurrent actions. |
| **RLS policy bugs causing data leakage** | Medium | High | Write automated test matrix for every visibility × membership × role × auth combination; avoid nested subqueries in policies; review policies in pull requests. |
| **Service-role key exposure or misuse** | Low | Very High | Store only in Vercel env vars; never accept from clients; code-review every service-role query; rate-limit `/api/mcp` and `/api/v1/admin/*`. |
| **OAuth users skip mandatory onboarding** | Medium | High | Enforce `painful_tool_stack_task` in both Next.js middleware and every write API route. |
| **No validated monetization path** | Medium | Medium | Accept this upfront; revisit paid circles only after 200+ engaged operators or clear enterprise demand. |

## Go / No-Go Recommendation

**Verdict: GO, with conditions.**

There are no hard blockers. The project is technically feasible, strategically aligned, and cheap to run. It should be treated as the **retention and signal-gathering layer** for PromptMetrics’ core business, not a venture-scale standalone SaaS.

**Conditions that must be accepted before starting:**

1. **MCP v2 alpha risk is real.** Pin the SDK, isolate the MCP surface, ship read tools only, and keep REST as the fallback. If beta instability is intolerable, defer MCP and launch with REST only.
2. **The real timeline is not 10–14 days for one dev unless scope is cut.** Plan for 2 devs (backend + frontend) and 12–18 days, or 3 devs for 10–14 days for the read-only MCP MVP. One dev needs roughly 5–7 weeks.
3. **RLS and gamification must be load-tested, not just coded.** Automated tests for the access matrix and concurrent point awards are non-negotiable. The reputation system will break trust the first time duplicate points appear or a private post leaks.

**Required before DNS cutover:**
- Supabase project created in `eu-central-1`.
- RLS policies tested for public / invite-only / paid × member / non-member / admin.
- Rate limiting active on public endpoints and `/api/mcp`.
- MCP route mounted and at least the 4 read tools return P95 < 2 s.
- Watched-phrase auto-flag pipeline active; no auto-reject.
- Onboarding field enforced end-to-end.

**Deferrable (and recommended to defer):**
- MCP write/admin tools.
- Marketing-site monorepo merge.
- Meilisearch/Algolia.
- Supabase PITR ($100/mo).
- Advanced analytics / DevCard sharing.

**No-go only if:** the team cannot accept a beta MCP SDK, has no frontend capacity to port Paper-v3, or needs guaranteed EU jurisdictional sovereignty before launch. Otherwise, build it as a free, high-trust knowledge and reputation layer, monetize only through tightly scoped paid circles later, and measure success by engagement quality and product insight yield, not revenue.
