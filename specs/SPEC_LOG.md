# SPEC_LOG.md — operator.promptmetrics.dev

## Project context
- **Product:** `operator.promptmetrics.dev` — community platform for the PromptMetrics ICP (operators, founders, teams handed an AI mandate).
- **Shape:** Skool-style circles/groups + daily.dev-style feed, gamification, and leaderboards, inside the PromptMetrics Paper-v3 design system.
- **Backend:** Purpose-built replacement for the current NodeBB headless backend.
- **Target repo:** `https://github.com/promptmetrics/pm-operator`.
- **Frontend source:** `https://github.com/iiizzzyyy/promptmetrics-website` (Next.js 16 App Router, Paper-v3 design system).
- **Scale target:** 10–50 active users in first 6 months.
- **Compliance:** EU data residency required; production-grade.

## Constraints and decisions already made
1. **Commercial validation skipped.** Market/business-model sections will be lightweight; technical and infrastructure validation will be deep.
2. **Access model:** Public-read, gated private groups. Engagement (post, comment, react) requires registration/login.
3. **Agent interface:** MCP server + REST API. Use v2 alpha / 2026-07-28 direction from `@modelcontextprotocol/server` using `createMcpHandler`. Accept protocol-stability risk for first-mover agent integration.
4. **Design system:** Reuse Paper-v3 tokens/components; do not introduce shadcn/ui as a second visual language.
5. **Stack direction:** Next.js 16 App Router full-stack API routes + Supabase (Postgres, Auth, Realtime, Storage) + Drizzle ORM.

## Artifacts produced
- `specs/01-concept-brief.md` — problem, solution, value prop, assumptions, principles, competitive landscape, risks.
- `specs/02-validation-report.md` — personas, JTBD, pain points, assumption tests, technical infrastructure validation, MCP/agent validation.
- `specs/03-concept-development.md` — refined solution narrative, user journeys, information architecture, technical concept, MCP architecture, gamification, security/compliance, decisions/trade-offs.
- `specs/04-feasibility-analysis.md` — strategic fit, lightweight business model, GTM, technical feasibility, costs, competitive positioning, risk register, go/no-go.
- `specs/05-prd.md` — product requirements, personas, user stories, functional/non-functional requirements, acceptance criteria, success metrics, MVP scope.
- `specs/06-technical-spec.md` — architecture, monorepo, stack, Drizzle schema, RLS/triggers, REST API contracts, MCP server spec, auth, realtime, gamification, security, infrastructure, migration, testing, observability, risk register.
- `specs/07-ux-spec.md` — design principles, IA, key screens, Paper-v3 component requirements, interaction patterns, responsive behavior, accessibility, gamification UX, empty states, realtime UX, errors, success metrics.
- `specs/08-roadmap.md` — release philosophy, 10-dev phased plan (Foundation → MVP Launch → Hardening → Growth), backlog with RICE/MoSCoW, dependency map, team allocation, milestones, success gates, risk contingencies.

## Decisions made (2026-07-29)
- **Pro tiers from day one:** Supabase Pro + Vercel Pro for EU data residency, SLA/uptime, and production-grade compliance. Free-tier feasibility removed as a core assumption.
- **Agent API parity scoped to core surfaces first:** feed, posts, comments, users, groups, leaderboards, flags, invites. Admin/gamification config deferred.
- **Group access control expanded from the start:** add `visibility` enum (`public`, `invite_only`, `paid`) plus `required_tier_id` for paid gating. Paid tiers are PromptMetrics-owned membership levels that unlock specific circles/cohorts, not user-created paid communities.
- **MCP SDK:** Adopt the v2 alpha / 2026-07-28 direction from `@modelcontextprotocol/server` using `createMcpHandler`. Accept the protocol-stability risk for first-mover agent integration.
- **Email provider:** Loops for transactional and marketing email, with branded templates from day one.
- **Rate limiting:** Upstash Redis via Vercel Marketplace integration. No extra Vercel surcharge; billing follows Upstash pricing. Free tier (256 MB, 10K cmd/sec, 10 GB bandwidth) is more than sufficient for 10–50 users. Use `@upstash/ratelimit` with fixed-window algorithm for minimal command cost.
- **Paid membership model corrected:** Paid tiers are PromptMetrics-owned memberships that unlock access to specific circles/cohorts. Launch is free membership only. `membership_tiers` and `user_memberships` tables are created in schema but inactive at launch.
- **Team size:** 10 developers available. Roadmap should reflect parallel workstreams and 1–2 week MVP timeline.
- **MCP safety switch:** `/api/mcp` mounted behind `NEXT_PUBLIC_MCP_ENABLED` feature flag with REST-only fallback. Read tools first; disable MCP instantly if v2 alpha breaks.
- **Early invite flow:** Automated via invite codes (`group_invites` table with code, max_uses, expires_at, role).
- **Watched phrases:** Auto-flag only; never auto-reject. Human moderator reviews every flag.

## Approval gates
| Phase | Gate | Status |
|---|---|---|
| 1 | Concept brief accurately captures idea? | approved |
| 2/3 | Technical/UX validation and concept development accepted? | approved |
| 4 | Feasibility analysis accepted; proceed, pivot, or stop? | approved — proceed |
| 5 | Final PRD, spec, UX spec, and roadmap approved for development? | awaiting approval |

## Key architectural decisions
- **Single deploy unit:** Next.js 16 App Router serves pages, `/api/v1/*`, and `/api/mcp` from `apps/web`.
- **Database-first domain logic:** RLS, triggers, and unique constraints enforce access and counter integrity before application code.
- **Server-only secrets:** Supabase service-role key, Loops API key, MCP token secret live only in Vercel env vars.
- **Read-first MCP:** MCP route feature-flagged; four read tools at launch (`search_posts`, `get_user_profile`, `list_leaderboards`, `summarize_thread`); write/admin tools deferred.
- **EU residency:** Supabase `eu-west-1`, Vercel `fra1`, signed DPAs/SCCs.
- **Postgres search at launch:** Full-text search + `pg_trgm`; defer Meilisearch/Algolia.
- **Paper-v3 frontend:** Reuse existing design system; no shadcn/ui.
- **Paid tiers are PromptMetrics-owned memberships** unlocking specific circles; launch is free-only but schema supports paid gating.

## Corrections
- **2026-07-29:** Paid membership model corrected. Paid tiers are PromptMetrics-owned memberships that unlock access to specific circles/cohorts, not user-created paid communities. Launch is free-only; paid tables exist in schema but are inactive.

## 2026-07-30 — Cross-document reconciliation pass

### Critical fixes
- RLS `users_update` policy fixed (was evaluating `role='admin'` against target row).
- `user_scores` global sentinel group seeded via migration.

### Cross-document alignment
- User roles locked to `member`, `moderator`, `admin`.
- Post/comment status enums expanded with `hidden`.
- Point-event weights finalized to canonical values: `topic_created=5`, `comment_created=3`, `solution_accepted=8`, `like_received=2`, `like_given=1`, `invite_accepted=5`, `posts_read=0.5`, `daily_visit=0.5`.
- `posts.title` made NOT NULL.
- `flags.auto_flagged` and `notifications.actor_id` added.
- `post_views` and `group_invites` RLS policies added.
- `reactions_select` policy restricted to group visibility.
- FTS index uses `simple` dictionary for multilingual support.

### Decisions
- Removed `posts.isSolved` and `comments.isAnswer`; derive solved state from `posts.accepted_comment_id`.
- Comments store sanitized HTML + `content_plain`, matching posts.
- `membership_tiers.price` stays nullable to allow a free tier.

### Timeline realism
- Headline changed to "2-week internal alpha / 4–6 week production-grade closed-alpha launch".
- Accessibility WCAG 2.1 AA moved to Must for Phase 1 production cutover.

### Open questions resolved
- #3 point weights: closed.
- #7 email provider: closed (Loops).
- #8 MCP SDK package: closed (pin exact package name in technical spec).

### Still open for team input
- Does hidden status mean "author + mods + admins can see" or "soft-delete with tombstone"?
- Exact per-route rate limits.
- `saved_posts` in MVP or post-MVP?

## Open questions
1. Do we need additional group states (`hidden`, `archived`) beyond `public`/`invite_only`/`paid`?
2. What exact notification payload shapes does the frontend need per `type`?
3. ~~What is the final point-event weight table and badge criteria?~~ **Closed** — weights finalized; badge criteria deferred to post-MVP.
4. Do invite codes need email-based delivery or is copy-link enough for launch?
5. What file-size limits, signed-URL TTLs, and content moderation apply to avatars/attachments?
6. What are the exact per-route rate limits (anonymous vs. authenticated vs. MCP)?
7. ~~Is Loops the final email provider for both auth and lifecycle emails, or only lifecycle?~~ **Closed** — Loops for all email.
8. ~~Which MCP SDK version and exact package name will we pin?~~ **Closed** — pin exact package in technical spec.
9. Do we implement `summarize_thread` with simple prompt + truncation, or an async job from day one?
10. What is the exact accessibility audit tool/process and who runs it?
11. What is the cutover trigger and owner for merging the marketing site into the monorepo?
12. Do we need a separate EU-hosted compute alternative later, or are Vercel DPA/SCCs sufficient?

## Recommended next steps
- **Day 1:** Pin MCP package version and verify v2 alpha Streamable HTTP compatibility.
- **Day 1–2:** Finalize point-event weights and badge criteria with PM + Community Lead.
- **Day 2:** Decide Loops scope and confirm OAuth provider scopes/copy.
- **Day 2:** Determine if additional group states (`hidden`/`archived`) are needed.
- **Day 3:** Define notification payload schema with Frontend Lead and finalize invite-code delivery method.
- **Day 3:** Set per-route rate limits with Backend + Security.
- **Day 4:** Define avatar/attachment limits, signed-URL TTLs, and content moderation rules.
- **Week 1:** Create Supabase `eu-west-1` project, configure Vercel project with env vars, push Drizzle migrations, seed groups/badges/watched phrases.
- **Week 1:** Begin RLS access-matrix test scaffolding and load-test plan for gamification race conditions.

## Top risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP v2 alpha instability | Medium | High | Pin SDK; feature-flag `/api/mcp`; read tools only; REST fallback. |
| Private content leak via auth/RLS bug — fixed pending review | Low | Very High | `users_update` RLS policy corrected; access-matrix tests; separate public/private queries; policy code review. |
| Gamification race conditions / duplicate points | Medium | High | DB triggers; atomic point awards; unique partial indexes; `user_daily_stats` caps; load test. |
| OAuth users skip mandatory onboarding | Medium | High | Enforce in middleware and every write route; redirect to `/register/complete`. |
| Service-role key exposure | Low | Very High | Server-only env var; never accept from clients; rate-limit admin/MCP routes; audit service-role queries. |
| RLS policy performance / bugs | Medium | High | `EXPLAIN ANALYZE`; avoid nested subqueries; policy review in PRs. |
| Vercel function timeouts on MCP heavy tools | Medium | Medium | Instrument P95; split heavy tools into async job + `community://jobs/{id}` resource. |
| Empty-room problem at launch | High | High | Seed 20–30 posts before inviting; founding members post weekly for first month. |
| Over-building agent layer before user validation | Medium | High | Read tools only at launch; defer write/admin tools until REST UI is validated. |
| NodeBB cutover DNS issues | Low | High | Keep VPS on standby 48h; use preview domain first; rollback via DNS. |
| Timeline compression if stakeholders push public launch before hardening | Medium | High | Anchor on "2-week internal alpha / 4–6 week closed-alpha launch"; gate cutover on WCAG AA, RLS review, and load-test sign-off. |

## 2026-07-30 — Round 2 corrections

### New issues fixed
- API examples refreshed to canonical point scale (124 instead of 1240).
- isSolved documented as computed only; search ranking uses accepted_comment_id.
- supportedProtocolVersions now includes 2026-07-28.
- Section 8.4 raw SQL marked illustrative; Drizzle schema is authoritative.
- Notification enum aligned: includes both flag and flag_resolved.
- UX action bars: removed Save/Share/Ask author from MVP; saved_posts stays post-MVP.
- Screen-reader copy updated to 124 points.

### Schema gaps closed
- Added posts.is_pinned for pinned circle resources.
- reactionTypeEnum default changed to 'like'.
- targetTypeEnum limited to post/comment at launch.
- dailyStatTypeEnum no longer includes daily_visit (tracked via point_events).
- Added unique constraint on watched_phrases.phrase.
- Documented sanctionedFraming, lesson post type, and monthly leaderboard period.

### Open questions closed
- #9 summarize_thread: closed — heuristic excerpt at launch, no LLM dependency.
- #13 hidden status semantics: closed — author + mods/admins see, others see placeholder.

### Early docs (01-04)
- Added historical-context banners and updated the most misleading stale assumptions (free tier, timeline, email, MCP SDK, access model).

## 2026-08-01 — Community-portal redesign decisions (D1–D10)

Source: `docs/DESIGN-GAP-REPORT.md` (gap analysis of Claude Design project `55d76da1-9a60-4a26-bf65-2490c4f2dda6` vs repo + specs). Decisions made by Izzy 2026-08-01.

### Point economy (D1)
- **The displayed economy is canonical: topic_created 10, comment_created 5, solution_accepted 25.** The technical-spec §9 table (5/3/8) and the shipped engine (5/2/25, weights inline at call sites) are both superseded; engine weights will be centralized and retuned.
- Existing `point_events` rows keep their historical values — **no backfill**; reputation drift between old and new rates is accepted.

### Streaks (D2/D3) — supersedes 07-ux-spec.md "Streaks" rules
- Streaks advance on **post or comment activity** (not only daily visits), pay a **+2/day streak bonus** (capped, idempotent per UTC day, new `streak_bonus` point event), and track `users.longest_streak_days` (new column).
- Overrides: "Streaks do not award extra points" (07-ux-spec:684) and "derived only from daily_visit events" (07-ux-spec:681).

### Design drops spec'd features — plan wins, relocate (D4/D6/D8/D9)
- Flag control stays, moved to a "…" overflow menu on posts **and comments** (comment flagging UI was missing pre-redesign — MOD-1 violation to fix).
- Notification bell stays in the header alongside the design's points/level/streak cluster.
- Circle page keeps pinned resources/Lessons, group leaderboard, and invite/manage buttons within the new layout.
- TipTap rich-text composer with @mentions stays, restyled as the design's pill composer.

### Scope additions (D5, D10 + v1 scope call)
- **All four optional domains are IN for v1:** Share button (navigator.share + copy-link), weekly digest, community events (Upcoming widget + events domain), and **Follow + Message (user following + DMs)** — explicitly overruling the PRD §2/§10 post-MVP deferral of DMs. DMs require a spec addendum (tables/contracts not yet designed).

### Responsive (D7)
- The five comps are the **desktop** spec (min-width 1100px); mobile/tablet layouts are derived from the existing Tailwind breakpoints. No regression of current responsive behavior.

### Open questions raised
- Level ladder confirmed as designed (Lv1 Newcomer 0 / Lv2 Builder 100 / Lv3 Contributor 400 / Lv4 Operator 900 / Lv5 Senior operator 1,500 / Lv6 Legend 3,000) against the 10/5/25 economy; revisit thresholds if inflation observed.
- ~~Streak-bonus cap value (default proposal: bonus stops counting past 30 consecutive days) — confirm with PM before WS2.~~ **Closed 2026-08-01** — 30-day cap confirmed by Izzy; implemented as `DAILY_CAPS.streakBonusMaxDays`.
- DM data model (tables, retention, GDPR erasure path) — spec addendum required before WS9 build.

### 2026-08-01 addendum — INVITE-3 fix
- `invite_accepted` points (5, to the inviter, once per `group_invites.id`) were spec'd but never awarded by any code path; fixed in `services/groups.ts` `acceptInvite` during WS2.

## Decisions made (2026-08-02) — WS9 social spec addendum (T9.0)

Closes the open SPEC_LOG bullets "Follow + Message … spec addendum required" (line 183) and "DM data model … spec addendum required before WS9 build" (line 191). Full spec: `specs/09-ws9-social-spec.md`. Approved by Izzy 2026-08-02.

- **Instant public follow (D9.1):** `follows(follower_id, followee_id)` unique pair; follow takes effect immediately (skool/daily.dev style), no request/accept state machine. Block/mute deferred to a later, separate feature.
- **3-table DM model (D9.2):** `conversations` + `conversation_participants` + `messages`, capped to 2 participants at launch (app-enforced), schema-ready for group DMs later. Rejected the simpler two-party `messages(sender_id, recipient_id)` table because Realtime filters on a single `conversation_id` column and RLS "participant-only reads" is a clean `EXISTS` subquery; group DMs later are a capacity change, not a schema rewrite.
- **Counts as columns, trigger-maintained (D9.3):** `users.follower_count` / `users.following_count` kept in sync by an `AFTER INSERT OR DELETE` trigger (the `member_count` pattern), not read-time `count(*)` (avoids extra queries on profile pages under the pool rule).
- **`messages.author_id` `onDelete: 'set null'` (D9.4):** preserves the counterparty's thread on erasure (anonymize-retain); the erasure step blanks the subject's sent bodies to `[message deleted]`. Rejected `cascade`, which would hard-delete the subject's messages from the counterparty's thread.
- **`/messages` under the `(community)` route group (D9.5):** reuses the existing `RealtimeProvider` (scoped to the community surface) — no provider lift to the root layout.
- **DM content policy = insert-then-flag (D9.6):** `autoFlagIfWatched(db, contentPlain, 'message', messageId)` inside the insert transaction, mirroring posts/comments; adds `'message'` to the `target_type` enum.
- **`updated_at` trigger only for `conversations` (D9.7):** the codebase has no auto-`updated_at` trigger anywhere; `follows` and `messages` are append-only (`created_at` only). `conversations.updated_at` is bumped on message insert for inbox sort.
- **No notification dedup (D9.8):** one `new_follower` per follow event, one `new_message` per message — matches existing `insertNotification` behavior.
- **Notification types added:** `new_follower`, `new_message` to the `NotificationType` const + the `notification_type` pgEnum (DO-block `ALTER TYPE ADD VALUE`); payload gains optional `conversationId`/`messageId`/`messagePreview`.
- **Rate limits added:** `follow` (20/60s per user) and `message` (30/60s per user) tiers in `lib/rate-limit.ts`, fixed-window over Upstash, fail-open.
- **Migration `0016`:** hand-written SQL mirroring `0015` (RLS/triggers/publication need raw SQL drizzle-kit can't generate), then `drizzle-kit generate` to emit the matching snapshot (decision 3A). `messages` added to the `supabase_realtime` publication.
- **GDPR runbook extended:** Section 3 export adds follows + sent messages + conversation memberships; Section 5 adds hard-delete follows (both directions), anonymize sent DM bodies, and orphan-conversation cleanup. Anonymize-retain is the DM erasure policy (decision 1A).
- **Public follower lists deferred (decision 2A):** follower/following *counts* are public; the edge list is self-only via RLS in v1 (privacy-leaning; lift later with one policy change).
- **DM email notifications in-app only (decision 4A):** `new_message` surfaces in the notification bell only; no Loops send in v1 (the `preferences.emailNotifications` gate can be wired later if requested).

## 2026-08-08 — Invite reward raised to 15 (D-A)

Source: `design/REDESIGN-PLAN.md` §4.9 (decision D-A). Approved by Izzy 2026-08-08.

- `POINT_WEIGHTS.invite_accepted` raised from 5 to 15 (`packages/api/src/contracts/points.ts`). Supersedes the 2026-08-01 INVITE-3 addendum's weight of 5 and the `invite_accepted | 5` rows in `06-technical-spec.md` / `07-ux-spec.md`.
- Existing `point_events` rows keep their historical values — **no backfill** (same rule as D1).

## 2026-08-09 — Profile pages are public by design

Surfaced while adding the DevCard middleware allowlist (D-B). Confirmed by Izzy 2026-08-09.

- `/u/{slug}` profile pages are **publicly readable**, as are `/g/…` circles and `/p/…` posts. This is intended, and consistent with D-B making DevCards public and shareable.
- Mechanically: `COMMUNITY_ROUTE_REGEX` in `apps/web/middleware.ts` reads `(g\/|p\/|u\/|leaderboards|…)(\/|$)` — the `u\/` branch consumes the slash and the trailing group then requires another slash or end-of-string, so only the bare `/u/` matches. `apps/web/app/(community)/u/[slug]/page.tsx` treats the session as optional and renders for anonymous visitors.
- **Do not "fix" this regex** without a product decision: tightening it to `/^\/(g|p|u)\//` would gate public circles and post permalinks, which `prod-smoke.spec.ts` asserts must stay anonymously readable.
- Still gated: `/settings`, `/messages`, `/bookmarks`, `/notifications`, `/moderation`, and all `/api/v1/` writes. `apps/web/e2e/access-matrix.spec.ts` asserts exactly that, and that the DevCard allowlist does not widen it.
- Note: `design/REDESIGN-PLAN.md` §4.6 assumed profiles were gated ("a prefix mistake would expose all `/u/` profile pages"). That premise was wrong; the allowlist is still written as an exact-segment match as defence in depth.
