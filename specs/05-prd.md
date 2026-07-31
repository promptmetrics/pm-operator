# PRD: operator.promptmetrics.dev

**Status**: Approved  
**Author**: Alex (Product Manager)  
**Last Updated**: 2026-07-29  
**Version**: 1.0  
**Stakeholders**: Engineering Lead, Design Lead, Community Lead, Legal/Compliance (GDPR/DPA)

---

## 1. Overview

`operator.promptmetrics.dev` is the purpose-built community platform for AI operators, founders, and teams with an explicit AI mandate. It replaces the NodeBB placeholder with a Next.js 16 + Supabase + Drizzle backend, a Paper-v3 frontend, and a unified human/agent interface. Members join intent-based circles, share builds and questions in a live feed, earn reputation through useful contributions, and consume the same knowledge through both the UI and a first-class REST + MCP API.

The launch build is scoped to a **2-week internal alpha, 4–6 week production-grade closed-alpha launch** with up to **10 developers** working in parallel workstreams. Paid membership tiers are built into the schema from day one (`membership_tiers`, `user_memberships`, `groups.required_tier_id`), but the launch experience is **free-only**. The MCP layer ships behind a feature flag with **read tools only**.

**Product principles retained from prior phases:**
1. Agent-native API parity — every human-facing feature is reachable under `/api/v1/**` and, where appropriate, via MCP.
2. Reputation reflects usefulness, not activity — accepted solutions and peer validation outweigh raw post count.
3. Circles over channels — content is organized by intent and outcome.
4. Public by default, private when valuable — public read drives discovery; private circles protect paid cohorts.
5. Ship fast, learn from real usage — no production data migration, so the priority is replacing NodeBB and letting operator behavior shape the next phase.

---

## 2. Goals and Non-Goals

### Goals

| Goal | Why it matters | Primary success metric |
|------|----------------|------------------------|
| Replace NodeBB with a controlled, EU-resident community backend | NodeBB fights custom onboarding, clean APIs, and agent integration | DNS cutover to `operator.promptmetrics.dev` |
| Enable persistent, searchable operator knowledge | Good answers currently disappear into Slack scrollback | Repeat search click-through rate > 40% |
| Surface trustworthy reputation | Reputation is invisible outside direct references | 35% signup-to-first-contribution within 7 days |
| Provide agent-readable community data | Operators want to query knowledge programmatically | > 100 MCP/REST agent calls/week by month 2 |
| Support gated private circles from day one | Paid cohorts and sensitive builds need access control | Zero leakage of private posts in access-matrix tests |
| Establish a daily learning habit | Operators need async, high-signal content | Median 4+ feed sessions/week for active users |

### Non-Goals

| Non-Goal | Rationale |
|-----------|-----------|
| Real-time chat as a primary interface | Forum/feed-first model reduces knowledge loss and overwhelm; chat may be explored later |
| Algorithmic recommendation feed | Deceptively expensive; launch uses transparent sorts (new, top, solved, unanswered) |
| Native mobile app | PWA/mobile web is enough for 10–50 launch users; native apps are post-MVP |
| MCP write/admin tools at launch | Read tools first to validate agent demand before exposing writes |
| Marketing-site monorepo merge | Marketing site stays in its own repo for launch to reduce DNS and build risk |
| Meilisearch/Algolia search | Postgres full-text search + `pg_trgm` is sufficient for launch scale |
| Automated content removal | Watched phrases auto-flag only; no auto-reject at launch |
| Payments UI for paid tiers | Schema supports `membership_tiers` and `groups.required_tier_id`, but no checkout flow until first paid cohort is defined |
| Saved posts | Feature request deferred to post-MVP; schema does not include `saved_posts` at launch |

---

## 3. Target Users and Personas

### Primary personas

| Persona | Role | Core motivation | What the product must do |
|---------|------|-----------------|--------------------------|
| **Alex Ríos** — Senior AI Operator / Freelance Consultant | Builds agent stacks for clients; active in Slack/Discord/LinkedIn | Persistent, searchable portfolio and visible reputation that attracts clients | Own a public body of answers/builds; earn visible reputation; host/join private circles |
| **Priya Nair** — AI Agent Builder / Startup Founder | Founder shipping an agent product | Vetted integration knowledge, REST + MCP API, EU-hosted production infra, gated circles | Query content via clean REST + MCP; discover intent-based circles; access invite/paid-gated circles |
| **Jordan Lee** — Junior Operator / Recent Builder | Learning by building; lurks before contributing | Beginner-friendly circles, low-stakes first contribution, transparent reputation progression | Find curated circles/resources; make first contribution with positive feedback; understand reputation path |

### Secondary users

| User | Role | Need |
|------|------|------|
| Community moderators | PromptMetrics team / trusted operators | Triage flags, resolve disputes, manage watched phrases, invite members |
| PromptMetrics admins | Internal product/ops team | Create groups, configure tiers, audit agent actions, run analytics |
| Claude Code / operator agents | Software agents | Discover, summarize, and cite community knowledge via MCP |

---

## 4. User Stories

Stories are grouped by JTBD and mapped to the primary personas.

### JTBD 1 — Incident problem-solving

**US-1.1 Ask a focused circle**  
As Alex, I want to post a question to a specific circle so that peers with relevant stack experience see it and can answer.

**US-1.2 Surface previously solved answers**  
As Alex, I want search to boost accepted-solution posts so that I do not rehash old Slack threads.

**US-1.3 Get async replies without losing context**  
As Priya, I want comments to appear in real time on a post so that I can follow a technical thread without refreshing.

### JTBD 2 — Reputation portfolio

**US-2.1 Showcase solved problems**  
As Alex, I want my profile to list accepted solutions and builds so that potential clients see proof of expertise.

**US-2.2 Earn visible reputation**  
As Jordan, I want points and badges next to my name when I contribute so that progress feels tangible and motivates quality participation.

**US-2.3 Share a DevCard**  
As Alex, I want a shareable Operator DevCard so that I can link my reputation from LinkedIn or X.

### JTBD 3 — Agent-readable knowledge

**US-3.1 Query community via API**  
As Priya, I want a stable `/api/v1` REST API for posts, comments, users, groups, and leaderboards so that my tools ingest vetted knowledge instead of scraping.

**US-3.2 Discover via MCP**  
As Priya, I want Claude Code to call `search_posts`, `get_user_profile`, `list_leaderboards`, and `summarize_thread` so that my agent uses community knowledge natively.

### JTBD 4 — Gated community monetization

**US-4.1 Join invite-only circles**  
As Alex, I want to join a private client cohort via an invite code so that sensitive builds stay inside a trusted circle.

**US-4.2 Prepare for paid tiers**  
As Priya, I want the platform to support paid-tier circles from day one in the data model so that PromptMetrics can launch premium cohorts without a schema migration.

### JTBD 5 — Daily learning habit

**US-5.1 See intent-relevant content quickly**  
As Jordan, I want a daily.dev-style feed filtered by "My circles," "Show Your Build," "Solutions," and "Unanswered" so that I learn something useful in 5–10 minutes.

**US-5.2 Understand why circles are recommended**  
As Jordan, I want onboarding to use my `painful_tool_stack_task` answer to rank circle recommendations so that circle choice feels like matchmaking, not a survey.

---

## 5. Functional Requirements

### 5.1 Auth / Onboarding

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| AUTH-1 | Support Supabase Auth with OAuth (GitHub, Google, LinkedIn) and email/password | US-3.1, US-5.2 | Minimal OAuth scopes; explicit "we only read public profile" copy |
| AUTH-2 | Enforce a mandatory `painful_tool_stack_task` onboarding field before any write action | US-5.2 | Enforced in Next.js middleware and every write API route |
| AUTH-3 | Redirect users missing `painful_tool_stack_task` to `/register/complete` after OAuth callback | US-5.2 | Frame as matchmaker, not survey |
| AUTH-4 | Allow authenticated users to update their profile (display name, bio, avatar, stack tags) | US-2.1 | Avatar stored in Supabase Storage private bucket with signed URL |
| AUTH-5 | Support password reset and company-branded auth email templates | AUTH-1 | Loops email for lifecycle/transactional; Supabase default auth email acceptable if Loops integration slips |
| AUTH-6 | Differentiate roles: `member`, `moderator`, `admin` | Admin journeys | Stored on `users.role`; used by RLS and API guards |

### 5.2 Groups / Circles

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| GROUP-1 | Store circles with `visibility` enum: `public`, `invite_only`, `paid` | US-4.1, US-4.2 | Replaces `is_public` boolean |
| GROUP-2 | Support `groups.required_tier_id` to link a circle to a `membership_tiers` row | US-4.2 | Tiers are PromptMetrics-owned; no checkout UI at launch |
| GROUP-3 | Allow authenticated users to join/leave `public` circles | US-5.1 | Joining writes a `group_memberships` row |
| GROUP-4 | Allow users to join `invite_only` circles only with a valid `group_invites.code` | US-4.1 | Code supports `max_uses`, `used_count`, `expires_at`, `role` |
| GROUP-5 | Block access to `paid` circles unless the user has an active matching `user_memberships` row | US-4.2 | `membership_tiers.is_active = false` at launch gates all paid circles |
| GROUP-6 | Display a circle landing page (`/g/:slug`) with header, pinned resources, leaderboard strip, and discussion feed | US-5.1 | Public circles render without auth; private circles show metadata + login CTA |
| GROUP-7 | Allow circle admins to pin 3–5 canonical posts as "Lessons" / pinned resources | US-5.1 | Stored as `posts.is_pinned = true` within the group |
| GROUP-8 | Maintain accurate `groups.member_count` via DB trigger on `group_memberships` | GROUP-3, GROUP-4 | Never application-level read-modify-write |

### 5.3 Feed / Posts / Comments

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| FEED-1 | Render a personalized feed at `/feed` for authenticated users | US-5.1 | Server component fetches first page; client subscribes to Realtime |
| FEED-2 | Support intent filters: `my-circles`, `show-your-build`, `solutions`, `unanswered` | US-5.1 | Applied via query params; backed by `posts.type` and `posts.accepted_comment_id` |
| FEED-3 | Allow compact daily.dev-style cards: title, circle tag, author reputation, engagement counts, stack tags | US-5.1 | Each card is `<article>` with proper heading hierarchy |
| FEED-4 | Allow creation of posts with title, body (rich text), circle, type (`question`, `build`, `discussion`), and tags | US-1.1 | Rich-text toolbar (TipTap) + preview; stores sanitized HTML and `content_plain` |
| FEED-5 | Support nested comments on posts with `parent_comment_id` | US-1.3 | Delete parent cascades to subtree |
| FEED-6 | Allow post authors or moderators to mark one comment as the accepted solution | US-1.2, US-2.1 | Enforce that `accepted_comment_id` belongs to the post via DB trigger |
| FEED-7 | Maintain `posts.upvotes` and `posts.comment_count` via DB triggers on `reactions` and `comments` | US-5.1 | Prevents drift |
| FEED-8 | Log post views to a `post_views` table and aggregate periodically; do not block render on view write | Analytics | Used for trending, not real-time count |

### 5.4 Reactions

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| REACT-1 | Allow authenticated users to add one `like` reaction per target (post/comment) | US-5.1 | Partial unique index on `(user_id, target_type, target_id)` |
| REACT-2 | Remove a reaction when the same user toggles it off | US-5.1 | Trigger decrements `posts.upvotes` |
| REACT-3 | Display reaction count on feed cards and comments | US-5.1 | Counter updated by DB trigger |

### 5.5 Gamification / Leaderboards

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| GAME-1 | Define a point-event table with weights that favor quality over volume | US-2.2 | `solution_accepted` > `like_received` > `comment_created` > `like_given` |
| GAME-2 | Award points atomically via `INSERT point_events` + `UPDATE users SET reputation_score = reputation_score + N` in a transaction | US-2.2 | Prevents race drift |
| GAME-3 | Enforce idempotency per event type using unique constraints and partial indexes | US-2.2 | See detailed table in Concept Development |
| GAME-4 | Cap daily points for `daily_visit`, `posts_read`, and `like_given` using `user_daily_stats` | US-2.2 | Atomic `INSERT ... ON CONFLICT ... DO UPDATE` with `count < cap` guard |
| GAME-5 | Maintain `user_scores` summary table via triggers for global and group-scoped leaderboards | US-2.1, US-3.2 | Periods: `all_time`; future: `weekly`, `quarterly` |
| GAME-6 | Expose global leaderboard at `/leaderboards` and group-scoped leaderboard at `/g/:slug/leaderboard` | US-2.1, US-3.2 | Use `rank()` / `dense_rank()` over `user_scores` |
| GAME-7 | Show a progress bar toward the next badge threshold in the user dropdown | US-2.2 | Exact thresholds visible; do not rely on color alone |
| GAME-8 | Award badges for concrete achievements (e.g., 10 accepted solutions = "Verified Operator") | US-2.2 | Badge criteria public; grant via admin flow or trigger |

### 5.6 Invites

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| INVITE-1 | Allow circle admins/moderators to create invite codes for `invite_only` circles | US-4.1 | `group_invites` table with `code`, `max_uses`, `expires_at`, `role` |
| INVITE-2 | Allow users to redeem a code and receive the configured role in the circle | US-4.1 | Increment `used_count`; reject if `used_count >= max_uses` or `expires_at < now()` |
| INVITE-3 | Award a small reputation bonus to the inviter when an invite is accepted | US-2.2 | One award per `invites.id` |
| INVITE-4 | Display invite status in the circle admin dashboard | US-4.1 | Uses, expiration, role |

### 5.7 Moderation

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| MOD-1 | Allow authenticated users to flag posts and comments with a reason | Admin journeys | Creates a `flags` row with `target_type`, `target_id`, `reason` |
| MOD-2 | Auto-flag posts/comments containing watched phrases; never auto-remove | Admin journeys | Watched phrases are operator-specific; default to flag only |
| MOD-3 | Provide a moderation queue at `/moderation` visible to `moderator` and `admin` roles | Admin journeys | Sort by status, target type, timestamp; support bulk resolve |
| MOD-4 | Allow moderators to change post/comment `status` to `published`, `draft`, `flagged`, `hidden`, or `deleted` (posts) / `published`, `hidden`, or `deleted` (comments). Hidden content remains in DB and is visible only to the author, moderators, and admins. | Admin journeys | |
| MOD-5 | Rate-limit new-user posts and reactions until first accepted solution or time threshold | Admin journeys | Reduce spam without blocking legitimate beginners |

### 5.8 Search

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| SEARCH-1 | Provide full-text search over post titles and `content_plain` at `/search?q=...` | US-1.2 | Postgres `to_tsvector` + GIN index |
| SEARCH-2 | Boost posts with accepted solutions in search ranking | US-1.2 | Apply rank multiplier in SQL |
| SEARCH-3 | Filter search results by circle, post type, and tag | US-5.1 | Query params: `group`, `type`, `tag` |
| SEARCH-4 | Respect group visibility in search: private circle content only for members | US-4.1 | Enforced by RLS/service-layer visibility check |
| SEARCH-5 | Show search-result cards with circle tag, accepted-solution badge, and author reputation | US-1.2 | Matches feed card pattern |

### 5.9 Notifications

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| NOTIF-1 | Create a `notifications` row for comment, reaction, solution, invite, flag, and flag_resolved events | US-1.3, US-4.1 | `payload` JSONB stores event-specific metadata. Notification enum includes both `flag` and `flag_resolved`. |
| NOTIF-2 | Broadcast notification count changes on Realtime channel `user:<id>:notifications` | US-1.3 | `notifications` table is source of truth; Realtime is push layer |
| NOTIF-3 | Provide a notification inbox at `/notifications` with read/unread state | US-1.3 | Mark read on open or click |
| NOTIF-4 | Do not steal focus on Realtime inserts; use `aria-live="polite"` | Accessibility | Batch multiple inserts into one announcement |
| NOTIF-5 | Send transactional email for high-signal events (accepted solution, invite accepted) if user opts in | US-2.2 | Loops email integration |

### 5.10 Admin

| ID | Requirement | User Story | Notes |
|----|-------------|------------|-------|
| ADMIN-1 | Allow `admin` role to create/edit/delete groups and configure visibility/tier | Admin journeys | Exposed via REST + UI; not via MCP at launch |
| ADMIN-2 | Allow `admin` role to manage `membership_tiers` (schema-ready, inactive at launch) | US-4.2 | No public checkout; used for future paid circles |
| ADMIN-3 | Allow `admin`/`moderator` roles to manage watched phrases | Admin journeys | Add/remove phrases; scan on insert |
| ADMIN-4 | Allow `admin` role to award points/badges manually in exceptional cases | Admin journeys | Logs `actor_id`, `reason` in `point_events` context |
| ADMIN-5 | Provide an agent-action audit view of MCP-mediated mutations | Admin journeys | Logs `client_id` (from `mcp_clients`), `user_id` (on behalf of), and `tool_name` in `agent_actions` |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement | Measurement |
|----|-------------|-------------|
| PERF-1 | Public feed pages render first meaningful content in under 1.5 s (TTFB + SSR) | Web Vitals / Vercel analytics |
| PERF-2 | Authenticated feed and profile pages use `dynamic = 'force-dynamic'`; no stale auth data | Code review |
| PERF-3 | MCP read tools complete P95 < 2 s at launch | Server logs; if exceeded, split into async job |
| PERF-4 | Search queries return in under 500 ms for up to 10,000 posts | `EXPLAIN ANALYZE` benchmark |
| PERF-5 | DB triggers keep counter drift to zero under 100 concurrent reactions/comments | Load test |

### 6.2 Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-1 | Enable RLS on every table | Migration policy; code review |
| SEC-2 | Supabase service-role key stored only in Vercel env vars; never accepted from clients | Env audit; PR checks |
| SEC-3 | Rate-limit public endpoints and `/api/mcp` using Upstash Redis | 100 req/min per `clientId` on MCP; stricter limits on anonymous routes |
| SEC-4 | Block all write endpoints until `painful_tool_stack_task` is populated | Middleware + API guard |
| SEC-5 | Never expose raw SQL or admin config tools via MCP | Tool allow-list review |
| SEC-6 | Enforce that `accepted_comment_id` belongs to the post via DB trigger | Schema validation |
| SEC-7 | MCP OAuth token decoded server-side; scope enforcement on every tool | `ctx.http.authInfo` + scope helpers |

### 6.3 Compliance

| ID | Requirement | Implementation |
|----|-------------|----------------|
| COMP-1 | Supabase production project created in `eu-west-1` (Frankfurt) before DNS cutover | Infra checklist |
| COMP-2 | Vercel functions pinned to `fra1` via `vercel.json` | `regions: ["fra1"]` |
| COMP-3 | Signed Supabase DPA and Vercel DPA/SCCs where required | Legal checklist |
| COMP-4 | Document data retention and deletion procedures for GDPR erasure requests | Privacy policy / runbook |
| COMP-5 | Use company-branded Supabase Auth email templates | Auth settings |
| COMP-6 | Add cookie consent if analytics or third-party embeds are used | Legal checklist |
| COMP-7 | Include OAuth provider data-processing terms in the privacy policy | Legal review |

### 6.4 Reliability

| ID | Requirement | Implementation |
|----|-------------|----------------|
| REL-1 | Feature-flag MCP route so it can be disabled without a deploy | LaunchDarkly or env flag |
| REL-2 | Rollback runbook ready before GA: revert feature flag, DNS, or DB migration | Launch checklist |
| REL-3 | Realtime clients dedupe messages by ID and rehydrate from `notifications` on reconnect | Client code review |
| REL-4 | Supabase Pro with PITR/backups configured after launch | Post-launch week 1 |
| REL-5 | Monitor Supabase/Vercel/Upstash dashboards weekly; set usage alerts | Ops runbook |

### 6.5 Accessibility

| ID | Requirement | Standard |
|----|-------------|----------|
| A11Y-1 | WCAG 2.1 AA compliance on all public and authenticated surfaces | Audit target: zero critical/serious issues |
| A11Y-2 | Semantic feed structure with `role="feed"` and each card as `<article>` | HTML review |
| A11Y-3 | Full keyboard-only signup → onboarding → create post → accept-solution flow | QA test script |
| A11Y-4 | Visible focus indicators on all interactive elements | CSS review |
| A11Y-5 | Realtime inserts do not steal focus; `aria-live="polite"` | Screen-reader test |
| A11Y-6 | Modals trap focus and return focus to trigger on close | ARIA practice |
| A11Y-7 | 4.5:1 contrast for badges, tags, progress bars; do not rely on color alone | Color-contrast audit |
| A11Y-8 | Honor `prefers-reduced-motion` for point animations, leaderboard updates, and realtime inserts | CSS media query |
| A11Y-9 | OAuth buttons labeled "Continue with GitHub," not just "GitHub" | Copy review |

---

## 7. Acceptance Criteria

### 7.1 Auth / Onboarding

| ID | Criteria | Priority |
|----|----------|----------|
| AC-AUTH-1 | Given an anonymous user, when they visit a public circle or post, then the content renders without login | Must |
| AC-AUTH-2 | Given a user signs up via OAuth, when the callback completes and `painful_tool_stack_task` is empty, then they are redirected to `/register/complete` | Must |
| AC-AUTH-3 | Given a user with an empty `painful_tool_stack_task`, when they attempt any write API call, then the call returns 403 with a clear error | Must |
| AC-AUTH-4 | Given a user completes onboarding, when they save their answer, then recommended circles are ranked by matching stack keywords | Should |
| AC-AUTH-5 | Given any auth error, when it occurs, then the UI shows inline validation and a path forward | Must |

### 7.2 Groups / Circles

| ID | Criteria | Priority |
|----|----------|----------|
| AC-GROUP-1 | Given a `public` circle, when an anonymous user visits `/g/:slug`, then they see the header, pinned resources, and discussion feed | Must |
| AC-GROUP-2 | Given an `invite_only` circle, when a non-member visits `/g/:slug`, then they see metadata and a login/join-with-code CTA but no posts | Must |
| AC-GROUP-3 | Given a `paid` circle with `membership_tiers.is_active = false`, when any user attempts to join, then the UI shows "Coming soon" and the API rejects | Must |
| AC-GROUP-4 | Given a valid invite code for an `invite_only` circle, when a logged-in user redeems it, then they become a member with the configured role | Must |
| AC-GROUP-5 | Given an expired or fully-used invite code, when a user redeems it, then the API returns 410 and the UI shows an error | Must |
| AC-GROUP-6 | Given a member joins or leaves a circle, when the transaction commits, then `groups.member_count` reflects the change within 1 s | Must |

### 7.3 Feed / Posts / Comments

| ID | Criteria | Priority |
|----|----------|----------|
| AC-FEED-1 | Given the feed page, when loaded, then the first page of posts renders server-side and Realtime subscription starts client-side | Must |
| AC-FEED-2 | Given the "unanswered" filter, when applied, then only posts with `accepted_comment_id IS NULL` and `status = published` are shown | Must |
| AC-FEED-3 | Given a logged-in user, when they create a post with title, body, circle, and type, then the post appears in the circle feed and the author receives points once | Must |
| AC-FEED-4 | Given a post author or moderator, when they mark a comment as accepted solution, then the comment author receives weighted points and the post gets an accepted-solution badge | Must |
| AC-FEED-5 | Given an attempt to mark a comment from a different post as the solution, when submitted, then the DB trigger rejects it | Must |
| AC-FEED-6 | Given 100 concurrent likes on a post, when the test completes, then `posts.upvotes` equals the number of distinct users and no duplicate reactions exist | Must |

### 7.4 Reactions

| ID | Criteria | Priority |
|----|----------|----------|
| AC-REACT-1 | Given a user clicks like on a post, when the action succeeds, then the count increments and the user receives a capped `like_given` point | Must |
| AC-REACT-2 | Given the same user clicks like again, when toggled, then the reaction is removed, the count decrements, and no duplicate point event exists | Must |
| AC-REACT-3 | Given a logged-in user, when they view a post, then their own reaction state is visually indicated | Should |

### 7.5 Gamification / Leaderboards

| ID | Criteria | Priority |
|----|----------|----------|
| AC-GAME-1 | Given a solution is accepted, when the transaction commits, then `users.reputation_score` for the comment author increases exactly by the `solution_accepted` weight and one `point_events` row exists | Must |
| AC-GAME-2 | Given concurrent attempts to award the same point event, when the race completes, then exactly one row wins and no score drift occurs | Must |
| AC-GAME-3 | Given a user reaches the daily cap for `like_given`, when they like additional posts, then no further `like_given` points are awarded that day | Must |
| AC-GAME-4 | Given a leaderboard request, when the API returns, then ranks are computed from `user_scores` and P95 response is under 200 ms | Should |
| AC-GAME-5 | Given a user earns a badge, when the event occurs, then the badge appears on their profile and cards with accessible alt text | Should |

### 7.6 Invites

| ID | Criteria | Priority |
|----|----------|----------|
| AC-INVITE-1 | Given a circle admin, when they create an invite code with `max_uses = 5` and `role = member`, then the code is persisted and shareable | Must |
| AC-INVITE-2 | Given the sixth user attempts to redeem the code, when checked, then the API returns 410 | Must |
| AC-INVITE-3 | Given an invite is accepted, when the transaction commits, then the inviter receives a one-time `invite_accepted` point event | Should |

### 7.7 Moderation

| ID | Criteria | Priority |
|----|----------|----------|
| AC-MOD-1 | Given a watched phrase exists, when a post/comment containing it is created, then a `flags` row is created with `auto_flagged = true` and the content remains visible | Must |
| AC-MOD-2 | Given a moderator views `/moderation`, when loaded, then open flags are sorted by recency and include target type, reason, and reporter | Must |
| AC-MOD-3 | Given a moderator resolves a flag, when saved, then the flag status updates, the resolver is recorded, and the affected content status changes if needed | Must |
| AC-MOD-4 | Given a user flag, when submitted, then the reporter identity is visible to moderators but not to the public | Must |

### 7.8 Search

| ID | Criteria | Priority |
|----|----------|----------|
| AC-SEARCH-1 | Given a search query, when submitted, then results include public posts and private-circle posts only for members | Must |
| AC-SEARCH-2 | Given two posts matching the same term, when one has an accepted solution, then the accepted post ranks higher | Should |
| AC-SEARCH-3 | Given a search result, when rendered, then it displays circle tag, accepted-solution badge, and author reputation | Should |

### 7.9 Notifications

| ID | Criteria | Priority |
|----|----------|----------|
| AC-NOTIF-1 | Given a new comment on my post, when it is created, then I receive a `notifications` row and a Realtime event on `user:<id>:notifications` | Must |
| AC-NOTIF-2 | Given I open the notification inbox, when read, then the unread count decrements and `read_at` is set | Must |
| AC-NOTIF-3 | Given multiple Realtime events, when they arrive within 1 s, then they are batched into a single polite screen-reader announcement | Should |

### 7.10 Admin

| ID | Criteria | Priority |
|----|----------|----------|
| AC-ADMIN-1 | Given an `admin` user, when they create a group, then the group is visible according to its `visibility` setting | Must |
| AC-ADMIN-2 | Given an `admin` user, when they create a `membership_tier` with `is_active = false`, then it exists in the schema but does not gate any public UI | Must |
| AC-ADMIN-3 | Given an MCP-mediated mutation, when it occurs, then the audit log contains `client_id`, `tool_name`, and `user_id` if applicable | Must |

---

## 8. Success Metrics

### 8.1 Launch success metrics (first 30 days)

| Metric | Baseline | Target | Owner | Measurement |
|--------|----------|--------|-------|-------------|
| Weekly active operators (WAU) | 0 | 25 | Community Lead | Analytics cohort |
| Signup-to-first-contribution within 7 days | 0 | 35% | PM | Funnel event tracking |
| Onboarding completion rate | 0 | 70% | PM | `painful_tool_stack_task` non-null |
| Posts with accepted solutions | 0 | 25% of answered posts | Community Lead | `posts.accepted_comment_id` |
| Average time to first helpful reply | — | < 6 hours | Community Lead | First comment timestamp |
| Like-to-view ratio | 0 | 8%+ | PM | `reactions` / `post_views` |
| Repeat search click-through rate | 0 | > 40% | PM | Search events |
| MCP/REST agent calls per week | 0 | > 100 | Engineering | Server logs |
| Support ticket deflection (PromptMetrics-related) | Current baseline | −20% within 90 days | Support | Ticket tagging |
| Cost per active user | — | < $2 | Ops | Infra bills / WAU |

### 8.2 Engineering quality metrics

| Metric | Target | Owner |
|--------|--------|-------|
| RLS access-matrix tests pass for every visibility × membership × role × auth combination | 100% | Backend Engineer |
| Zero duplicate `point_events` under concurrent load | 100% | Backend Engineer |
| MCP read tool P95 latency | < 2 s | Backend Engineer |
| Public feed TTFB | < 1.5 s | Frontend Engineer |
| WCAG 2.1 AA critical/serious issues | 0 | Design / QA |

### 8.3 Month-6 targets

| Metric | Target |
|--------|--------|
| Signup-to-first-contribution within 7 days | 50% |
| 6-month retention of first contributors | 40% |
| Agent API calls per week | 100+ |
| Moderation queue resolution time | < 24 hours |
| False-positive flag rate | < 10% |
| Private group monthly activity | 80% |

---

## 9. Open Questions

These questions must be resolved before dev start or during the first sprint.

| # | Question | Owner | Deadline | Status |
|---|----------|-------|----------|--------|
| 1 | Do we need additional group states (`hidden`, `archived`) beyond `public`/`invite_only`/`paid`? | PM + Community Lead | Day 2 of sprint | Open |
| 2 | What exact notification payload shapes does the frontend need for each `type`? | Frontend Lead | Day 3 | Open |
| 3 | What is the final point-event weight table and badge criteria? | PM + Community Lead | Day 2 | Closed — canonical values adopted |
| 4 | Do invite codes need email-based delivery or is copy-link enough for launch? | PM | Day 3 | Open |
| 5 | What file-size limits, signed-URL TTLs, and content moderation apply to avatars/attachments? | Design + Backend | Day 4 | Open |
| 6 | What are the exact per-route rate limits (anonymous vs. authenticated vs. MCP)? | Backend + Security | Day 3 | Open |
| 7 | Is Loops the final email provider for both auth and lifecycle emails, or only lifecycle? | Ops | Day 2 | Closed — Loops confirmed |
| 8 | Which MCP SDK version and exact package name will we pin (`@modelcontextprotocol/server` vs. `@modelcontextprotocol/node`)? | Backend | Day 1 | Closed — pin exact package name in technical spec |
| 9 | Do we implement `summarize_thread` with a simple prompt + truncation, or an async job from day one? | Backend + PM | Day 4 | Closed — heuristic excerpt for summarize_thread at launch; no LLM dependency. |
| 10 | What is the exact accessibility audit tool/process and who runs it? | Design + QA | Day 8 | Open |
| 11 | What is the cutover trigger and owner for merging the marketing site into the monorepo? | PM + Ops | Post-MVP | Open |
| 12 | Do we need a separate EU-hosted compute alternative later, or are Vercel DPA/SCCs sufficient? | Legal | Month 1 | Open |
| 13 | Does hidden status mean 'author + mods + admins can see' or 'soft-delete with tombstone'? | PM + Backend | Day 2 | Closed — hidden content remains visible to author, moderators, and admins; everyone else sees a 'Removed by moderator' placeholder. |

---

## 10. Out of Scope (MVP vs. Post-MVP)

### In scope for MVP (launch)

- Next.js 16 App Router community app in `apps/web`
- Supabase Pro `eu-west-1` project with Drizzle schema + migrations
- Supabase Auth (OAuth + email/password) and mandatory `painful_tool_stack_task` onboarding
- Groups with `visibility` enum `public`/`invite_only`/`paid` (paid inactive)
- Public read of circles and posts; auth required for engagement
- Posts, comments, accepted solutions, reactions
- Post status enum: `published`, `draft`, `flagged`, `hidden`, `deleted` (posts) / `published`, `hidden`, `deleted` (comments)
- Feed with intent filters (my-circles, show-your-build, solutions, unanswered)
- Postgres full-text search + `pg_trgm`
- Gamification: point events, atomic scoring, daily caps, `user_scores`, leaderboards
- Invite codes via `group_invites` table
- Watched-phrase auto-flag moderation queue
- Supabase Realtime for posts, comments, notifications
- Upstash Redis rate limiting
- Loops email for lifecycle/transactional (Supabase default acceptable if needed)
- REST API parity for feed, posts, comments, users, groups, leaderboards, flags, invites
- MCP read tools: `search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread`
- Paper-v3 frontend port of profile, feed, circle pages, notifications, moderation queue
- WCAG 2.1 AA baseline

### Post-MVP (defer)

| Feature | Why deferred | Trigger to revisit |
|---------|--------------|-------------------|
| MCP write/admin tools | Read tools first to validate demand | 100+ agent calls/week and clear use case |
| Payments/checkout for paid tiers | No paid cohort defined; schema is ready | 200+ engaged operators or enterprise demand |
| Marketing-site monorepo merge | Avoid DNS/build risk at launch | Community app stable and DNS cutover complete |
| Meilisearch/Algolia | Postgres search sufficient for launch scale | Search becomes primary feature or > 10k posts |
| Native mobile app | PWA enough for 10–50 users | Sustained mobile usage > 40% |
| Real-time chat / DMs | Forum/feed-first reduces knowledge loss | User feedback strongly requests async chat |
| Advanced analytics / DevCard sharing | Nice-to-have trust signal | Reputation system proven and design resources free |
| Supabase PITR backups ($100/mo) | Cost deferral at tiny scale | Week 1 post-launch |
| SSO / SAML | Enterprise sales motion not the beachhead | Enterprise paid circles defined |
| Automated content removal | Human-in-the-loop required at launch | Scale makes manual review impossible |

---

## Appendix: Requirement-to-Persona Mapping

| Persona | Primary requirements |
|---------|----------------------|
| Alex Ríos | FEED-3, FEED-4, FEED-6, GAME-1, GAME-6, GROUP-4, GROUP-7, INVITE-3, SEARCH-1, SEARCH-5 |
| Priya Nair | AUTH-1, GROUP-2, GROUP-5, SEARCH-3, ADMIN-2, MCP read tools, REST parity |
| Jordan Lee | AUTH-2, AUTH-4, FEED-2, FEED-3, GAME-7, GROUP-7, NOTIF-1 |
| Moderators | MOD-1, MOD-2, MOD-3, MOD-4, ADMIN-3 |
| Admins | ADMIN-1, ADMIN-2, ADMIN-4, ADMIN-5, all security/compliance requirements |
| Agents / Claude Code | MCP read tools, REST `/api/v1/**`, ADMIN-5 audit |
