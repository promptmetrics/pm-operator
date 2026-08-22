# Operator Stack SEO Content Fixes — Implementation Plan

**Date:** 2026-08-21 (rev 2 — design bundle integrated) · **Sources:** `~/Documents/pm-seo/OPERATOR-HANDOVER-CONTENT-2026-08-19.md` (content handover), `OPERATOR-HANDOVER-DEV-2026-08-19.md` (already shipped), `update/mint/promptmetrics-community-portal-redesign/project/*.dc.html` (pixel targets), `update/promptmetrics-community-portal-redesign/COPY-HANDOVER-2026-08-21.md` (final copy)

## Context

The 2026-08-19 full-site SEO audit of operator.promptmetrics.dev produced two handovers. The **dev handover (items 1–13 + backlog) is done** — `7bcc968` + follow-ups, deployed 2026-08-20. This plan covers the **content handover** (items 1–7): landing copy, circle strings, empty circle, bios, the authoring convention, engagement and off-site playbooks.

**Rev 2 changes:** the design bundle arrived after rev 1 approval. Every new/restyled screen now has a pixel-perfect target in the **mint variant** of the bundle, and final copy comes from the copy handover — 21 length-checked replacements (each within +2/−12 chars of the mockups, so no reflow risk). Where the handover covers a string, use it verbatim; where it doesn't, the mockup string is final. **No em dashes in any new brand copy we ship; "coding agents", never "AI"; active voice.**

Locked decisions:
- Claude drafts, user edits — but only for content the handover/mockups don't already cover (seed post bodies, retrofits, playbooks).
- `fix-this-workflow` gets seeded with real posts, not noindexed (item 3).
- Bios are self-serve + part of onboarding + one-time +5 pts award, ≥50-char gate (item 4).
- Authoring convention lives on a public `/guidelines` page (item 5), built to `Guidelines.dc.html`.
- Landing data: **counts from our own Postgres, cached once per day** (`unstable_cache`, 24h) — no per-request COUNT queries, no PostHog API. Proof posts curated by slug with live fallback.

## Design source of truth

- **Mockups** (read markup directly; recreate pixel-perfect per bundle README — no screenshots): `update/mint/promptmetrics-community-portal-redesign/project/`
  - `Landing.dc.html` → Phase 1
  - `FixThisWorkflow.dc.html` → Phase 2 (circle page)
  - `Settings.dc.html` + `Onboarding.dc.html` → Phase 3 (bio feature)
  - `Guidelines.dc.html` → Phase 4
  - `Profile.dc.html` → Phase 3f (bio/links display)
  - `Feed.dc.html`, `Circle.dc.html`, `Post.dc.html`, `Leaderboards.dc.html` → **site-wide redesigns, out of scope here** (separate effort).
- **Copy**: `update/promptmetrics-community-portal-redesign/COPY-HANDOVER-2026-08-21.md` — L1–L5 (landing circle cards), F1/F2 (feed, feed redesign is out of scope), W1–W3 (fix-this-workflow), G1–G6 (guidelines), O1/O2 (onboarding), S1/S2 (settings), P1 (post composer). "Verified, no change" sections confirm the rest of the mockup copy ships as-is.
- **Tokens**: every CSS var the mockups use already exists in the repo design system (`--pm-coral-tint`, `--pm-cat-education`, `--pm-muted-soft`, fonts, radii, shadows — verified by grep). The mint variant only **overrides values** on the paper vars. Apply globally in the tokens file (all 10 mockups use mint site-wide):
  `--pm-paper: #e4ece2` · `--pm-paper-2: #dbe5d8` · `--pm-paper-3: #cedbca` · `--pm-paper-inset: #f2f7f0` · `--pm-line: #cdd9c8` · `--pm-line-2: #b4c6af` — plus mint link colors `#a94d30` / hover `#8f3d24` on the new pages.

## What exists already (reuse, don't rebuild)

- `/feed` unique title/desc/canonical + WebSite JSON-LD (`apps/web/app/(community)/feed/page.tsx` lines 129–137 — comment says JSON-LD lives there *because* `/` 308s; moving it to `/` is sanctioned).
- Group `generateMetadata` reads `groups.description` live → **new descriptions are an admin-UI change (`/admin/groups`), no deploy**.
- `users.aboutMe` + `updateUserProfile` (`apps/web/lib/services/users.ts:284`, writes `aboutMe` at :295) + PATCH contract — only UI, the award, and the two links columns are missing.
- `awardPoints()` (`apps/web/lib/services/points.ts:8`) with check-exists + unique-constraint idempotency; partial unique index precedent `uniqueDailyVisit` (`packages/db/src/schema.ts:399`); **score rollup is a DB trigger** (migration 0010) — a new event type earns points with zero app-side score code.
- `Step1Focus` + `saveOnboardingStep1` (`apps/web/app/register/complete/actions.ts:28`) — the bio card rides this step.
- SEO helpers: `serializeJsonLd`, `buildWebSiteJsonLd`, `metaDescription`.
- UI kit: `Button (asChild)`, `Card`, `StatCard`, `Logo`. **No Textarea component** — styled native `<textarea>` per mockups (1px `--pm-line-2` border, `--pm-radius-sm`, `#d97757` focus border).
- Test precedent: `apps/web/e2e/*.vitest.ts`.

## Traps (hard constraints)

- **Pool starvation:** ≤3 DB queries per landing recompute; no wide `Promise.all`.
- **force-dynamic:** landing DB access lives inside `unstable_cache(fn, key, { revalidate: 86400 })`, page stays force-dynamic — never page-level `revalidate`/ISR (CI builds without `DATABASE_URL`).
- **pgEnum trap:** `point_event_type` IS a pgEnum. `db:generate` emits broken bare `ALTER TYPE … ADD VALUE` — hand-wrap in a guarded `DO $$ … IF NOT EXISTS (pg_enum) … $$;` block; reject any `SET DATA TYPE`/`DROP TYPE`. Migrate **test DB first** (local `.env.local` points at prod).
- **Slugs are permanent:** retrofit edits must never change post slugs or URLs.
- **Copy is final:** brand strings must match the copy handover/mockups character-for-character (they were length-checked for layout). No em dashes in anything we author new. (The one exception: `BioLengthMeter` counter strings ship exactly as the mockups show them — the handover reviewed Onboarding/Settings and did not flag them.)

---

## Phase 0 — Content prep (no deploy; unblocks everything)

1. **`groups.description` via `/admin/groups`** — drives the circle page header (renders the long version, per `FixThisWorkflow.dc.html`) and the meta description. Em-dash-scrubbed per handover W1:

| Circle | Description (~140 chars) |
|---|---|
| where-do-i-start | First steps for RevOps, CS, and marketing-ops leads adopting coding agents in daily operations: what to automate first, what to avoid, where to begin. |
| whats-in-your-stack | Tools, MCP servers, and integrations operators actually run: what works with what, honest trade-offs, stack teardowns from people running 3+ SaaS tools. |
| the-watercooler | Introductions, founder stories, and off-topic conversation from the Operator Stack community: the people behind the builds, in their own words. |
| make-it-stick | Adoption, habits, and change management for agent workflows: how operators get teams to keep using the automations they ship. |
| fix-this-workflow | Bring a broken RevOps, CS, or marketing-ops workflow and the community helps fix it. Real teardowns of real pipelines, with concrete numbers. |

2. **Seed drafts** for `fix-this-workflow` — the mockup already names both posts; Claude authors full convention-compliant bodies into `docs/seo/SEED-POSTS.md`; user posts them personally via the UI (honest authorship; earns `topic_created` points naturally). Fix any em dashes at authoring time (handover flag 1):
   - **Seed 1:** "Our lead-routing workflow assigns every inbound form fill twice: where is the duplicate coming from?" — excerpt/chip/tags per mockup: "Nine steps, two webhooks, and a retry with no idempotency key. Over five months that produced 1,900 double-assigned leads…" · `1,900 double leads` · `#hubspot #routing #webhooks`.
   - **Seed 2 (ends Solved):** "Why does our renewal-risk digest go quiet for a week every quarter-end?" — "…except the three Mondays a year when the CRM export job is still running…" · `3 misses/year` · `#zendesk #digest #scheduling`. Accept one reply as the solution so the Solved state renders.
3. **Landing copy finality check** — strings come from the mockup + L1–L5; they land in `apps/web/app/landing-copy.ts` verbatim, no drafting needed.

## Phase 1 — Landing page at `/` (replaces the 308)

**Pixel target: `Landing.dc.html`.** Sections in order: minimal header (Operator Stack lockup + coral dot, "Browse the feed", "Guidelines", "Log in", coral "Join the community") → hero (mono badge "A community for operators, not engineers"; 62px serif H1 with italic coral-dark `work together`; subhead; coral "Join the community — free" + "Read this week's builds first →") + stats rail (two 38px serif counts + "Counts recomputed daily from our own database.") → personas grid ("Written by people with your job title", 4 cards: RevOps managers / CS directors / Marketing-ops leads / DTC founders) → "Three builds from this month" proof rows (01/02/03 mono index, serif title, excerpt, right-aligned author + circle, each linking to a canonical post) → "Five circles" grid (L1–L5 blurbs + dashed "Browse all circles →" card) → "Your first week" (01 Say who you are — mentions the bio points bonus / 02 Bring one broken workflow / 03 Ship it and write it up) → closing CTA "Post your stack. Get it torn apart, kindly." → footer (© 2026 PromptMetrics · Operator Stack, Posting guidelines/Feed/Leaderboards).

**New files:**
- `apps/web/app/landing-copy.ts` — typed `LANDING_COPY` object holding every landing string verbatim from the mockup (L1–L5 applied) + `PROOF_POST_SLUGS`. One file to edit when copy changes.
- `apps/web/lib/services/landing.ts` — `getLandingData = unstable_cache(…, ['landing-page-data'], { revalidate: 86400 })`. Per recompute, ≤3 sequential queries: (a) member `count()`; (b) public post `count()` (same published+public predicate as sitemap); (c) proof posts by slug — title, word-boundary excerpt, author, group — with fallback fill from top recent public posts for any stale slug.
- `apps/web/app/components/LandingCta.tsx` — client Button asChild → `/register`, fires `trackEvent('landing_cta_click')` (add to the `AnalyticsEvent` union). Both coral landing buttons use this.

**Modified:**
- `apps/web/app/page.tsx` — replace `permanentRedirect`: static `metadata` (unique title/desc/canonical/OG/Twitter); moved `serializeJsonLd(buildWebSiteJsonLd(...))`; sections above in mockup order; max-width 1080px, padding `0 40px`; mint palette active via the global token change.
- `apps/web/app/(community)/feed/page.tsx` — delete the JSON-LD script block; keep metadata.
- `apps/web/app/sitemap.ts` — prepend `/` (`LANDING_LASTMOD` module constant bumped on copy changes; never `new Date()`); `/feed` drops to priority 0.9.
- Shared in-app `Header` lockup — "operator.promptmetrics" → "Operator Stack" (coral dot retained). Decided 2026-08-21: one brand name across the whole site.

**Tests:** `landing-jsonld.vitest.ts` (graph + `WWW_ORGANIZATION_ID` linkage); `landing.spec.ts` Playwright (200 not 308, unique H1, one JSON-LD, CTA hrefs, both stats present); extend `query-budget-units.vitest.ts` to pin ≤3 queries per recompute.

## Phase 2 — Circle title template + fix-this-workflow circle sections

**Pixel target for the circle page: `FixThisWorkflow.dc.html`.**

1. **Title template** (`apps/web/app/(community)/g/[groupSlug]/page.tsx:76-85`): `const title = \`${group.name} — Operator Stack community\`` for title/OG/Twitter. Verify <60 chars per circle; curl check post-deploy.
2. **Header description** renders `groups.description` (already live; the Phase 0 strings apply).
3. **Per-circle content map** — new `apps/web/lib/circle-content.ts` keyed by slug (no DB change). For `fix-this-workflow`: "How this circle works" 3-step card (steps 01–03 per mockup, W2 applied), "What makes a good teardown" sidebar checklist, empty state ("Nothing broken here yet" + W3 body + "Post the first one" + "How to write it →"), seeded-state footer ("Two teardowns so far. Yours makes three."). Circles without an entry render today's plain list. Data-driven from the map so the other four circles can get sections later without code changes.

## Phase 3 — Bio feature (settings + onboarding + points + links)

**Pixel targets: `Settings.dc.html`, `Onboarding.dc.html`, `Profile.dc.html`.**

**3a. Migration 0027 (trap protocol):**
- `packages/db/src/schema.ts`: append `'profile_bio'` to `pointEventTypeEnum`; `uniqueIndex('point_events_profile_bio_idx').on(table.userId).where(sql\`${table.eventType} = 'profile_bio'\`)`; add `linkedinUrl text`, `githubUrl text` to users. Add `headline text` ("Role & company" field — see Open decisions).
- `pnpm db:generate` → **read the SQL line by line**; hand-wrap `ADD VALUE` in the guarded `DO $$ … pg_enum … $$;`; confirm a second `db:generate` is quiet.
- `packages/api/src/contracts/points.ts`: `PROFILE_BIO: 'profile_bio'`; `POINT_WEIGHTS[PROFILE_BIO] = 5`. Update `points-contract.vitest.ts`.
- Contracts: `patchMeRequestSchema` gains `linkedinUrl`/`githubUrl` (`z.string().url().optional()`) and `headline`; the `/me` GET response exposes `bioBonusEarned: boolean` (one cheap pointEvents lookup — settings page only, no hot path). Extend the `/u/` public profile fetch.
- Migrate test DB first, then prod.

**3b. Points award:** `apps/web/lib/services/points.ts` — `awardProfileBio(db, userId)`: own existence check (awardPoints' check-exists only fires with `sourceId`; bio has none), then `awardPoints`; the unique index is the race guard. Called from `updateUserProfile` on every save where `aboutMe.trim().length >= 50` (failure logged, never fails the profile save). Blast-radius grep for exhaustive switches over event types — none expected.

**3c. Shared meter component:** `apps/web/components/BioLengthMeter.tsx` (client) — the mockups' exact widget: 4px bar (`--pm-paper-3` track, coral fill flipping to `--pm-green` at ≥50 trimmed chars, 0.18s width transition) + mono counter. Counter strings verbatim from the mockups: `50 characters to earn the bonus` (empty), `N more to earn the bonus`, and earned-state `N characters — bonus unlocked` (onboarding) / `N characters` (settings). Pure function of the textarea value; used in both Settings and Onboarding.

**3d. Settings page** — restyle per `Settings.dc.html`: Identity card (avatar, Display name, Role & company), About me card (S1 helper; bonus badge states — `+5 pts on first save` coral-tint pill when `!bioBonusEarned`, `✓ +5 pts earned` paper-3/green pill when earned; 5-row textarea with the Northwind placeholder; `BioLengthMeter`), Links card (S2 helper; LinkedIn + GitHub mono inputs, 90px label column), footer (Save changes coral button, "View public profile →"). Settings sidebar (Profile/Account/Notifications/Email digest) only if those sections exist today; otherwise ship the single Profile section and note the sidebar as design debt. All fields ride the existing PATCH `/api/v1/me`.

**3e. Onboarding step 1** — per `Onboarding.dc.html`: H1 "What are you here to fix?" + O1 subhead; existing focus chips; bio card ("Tell the community who you are" + `+5 pts` coral-tint pill + O2 helper + 4-row textarea with the RevOps-lead placeholder + `BioLengthMeter`); footer: Continue coral, "Skip for now", "Posting guidelines" link. `saveOnboardingStep1` writes `aboutMe` then calls `awardProfileBio`. `Step3Primer` gains a guidelines link (no checklist item).

**3f. Profile display + JSON-LD:** bio paragraph and `in`/`gh` links (`rel="me noopener"`) render on `/u/[slug]` per `Profile.dc.html` (also renders `headline` under the name when set); `buildProfileJsonLd` emits `Person` (`@id: {url}#person`, description from `aboutMe`, `sameAs` when links exist).

**Tests:** `profile-bio-award.vitest.ts` (repeat saves → single event; <50 chars → none); `settings-bio.spec.ts` e2e (save → PATCH; re-save → still one event; badge flips to earned).

## Phase 4 — /guidelines page

**Pixel target: `Guidelines.dc.html`; strings: handover G1–G6 applied over mockup text.**

`apps/web/app/(community)/guidelines/page.tsx` — static, own metadata/canonical. Sticky "On this page" aside (01–05 anchors) + "New post" coral card; main column: intro (G1), five rule sections with mono numbers, question-phrased H2s, per-rule artifacts — rule 01 Don't/Do example cards (danger/green left borders, G2–G3), rule 02 Instead-of/Write heading pairs, rule 03 number chips (`6 wks → 40 min`, `41,000 records`, …), rule 04 source-citation example card (G5–G6), rule 05 coral-tint "The one-line version:" closer; footer CTA row ("Write a post" + "See a post that follows all five →"). Links: `LeftRail.NAV_ITEMS` + mirrored `Header.tsx` menu, `CreatePostForm` composer, onboarding footer + `Step3Primer`, landing footer. Sitemap: `GUIDELINES_LASTMOD` constant, priority 0.5.

## Phase 5 — Retrofit the 3 flagged posts (Claude drafts, user applies)

1. Identify via MCP `search_posts`: HubSpot-cleanup build; outcome-mandates post; the "I's really hard" typo post.
2. Rewrite bodies to the convention (front-loaded answer in 40–60 words; question headings; ~140–170-word sections; numbers; per-claim primary sources; typo fix in first 155 chars; no em dashes).
3. Apply via MCP `update_post` / admin UI. **Slugs unchanged.**
4. Per post: curl the meta description; GSC request indexing.

## Phase 6 — Ops playbooks (docs, user-executed)

- `docs/seo/ENGAGEMENT-PLAYBOOK.md` — 24h substantive-reply ritual ("substantive" = adds a number, source, or counter-example — matches Guidelines rule 05); working questions to solved (+25 pts); founding-member recruiting (3–5 people, each ≥50-char bio + links — ties Phase 3 to E-E-A-T).
- `docs/seo/OFFSITE-PLAYBOOK.md` — target subreddits with answer-first/no-link-drop rules; YouTube plan (HubSpot cleanup walkthrough first); <3-month freshness cadence; measurement loop (Perplexity/ChatGPT checks; GSC vs 11-impressions baseline; "Discussions and forums" module).

## Open design decisions — resolved 2026-08-21

1. **Header lockup → "Operator Stack" everywhere (user, 2026-08-21).** The mockups' split (marketing name outside, domain inside) is rejected; one lockup to maintain. Landing/Onboarding already show "Operator Stack"; Phase 1 additionally updates the shared in-app `Header` lockup from "operator.promptmetrics" to "Operator Stack" (coral dot retained). Small blast radius — one component.
2. **Circle taxonomy (handover flag 2) — no action.** Feed/Circle/Post mockups use the dev-seed circles; Landing/FixThisWorkflow use the 5 prod circles. Prod wins; the dev-seed mockups are stale. The landing circles grid hardcodes the 5 prod slugs via L1–L5.
3. **"Role & company" field → added (user, 2026-08-21).** `headline text` column ships in migration 0027 alongside the bio/links changes; editable in Settings, rendered on `/u/` when set.
4. **Em dashes in sample content (handover flag 1):** fix at authoring time only — the two seed posts (Phase 0.2) and Phase 5 retrofits ship dash-free; we do not rewrite published community content for style.

## Sequencing

1. **Phase 0** (admin strings, seed drafts) — immediate, unblocks everything.
2. **Mint token change + Phases 1 + 2** → one PR (sprint 1).
3. **Phase 3** → migration applied **before** app code deploys (sprint 2).
4. **Phases 4–6** independent; Phase 5 waits on drafts.

## End-to-end verification

- `pnpm typecheck`; unit tests (`landing-jsonld`, `profile-bio-award`, updated `points-contract` + `query-budget-units`); Playwright (`landing.spec.ts`, `settings-bio.spec.ts`). CI (E2E serialized) green → push to main auto-deploys.
- Warm landing request = **0 DB queries** (24h cache); recompute ≤3.
- **Visual:** landing / onboarding / settings / guidelines / fix-this-workflow compared section-by-section against the mint mockups (dimensions, palette, type scale) before merge.
- **Copy:** handover strings grep-verbatim in the built pages; no em dashes (`—`) in brand strings on landing, guidelines, onboarding, settings.
- Post-deploy curls: `/` → 200 + unique title + canonical + one JSON-LD; each `/g/*` → unique <60-char title; sitemap includes `/` + `/guidelines`; a profile → Person JSON-LD + sameAs; Rich Results Test on `/`.
- PostHog Live: `landing_cta_click` fires on both Join buttons.
- GSC (`sc-domain:promptmetrics.dev`, filter `operator.`): request indexing for `/`, all 5 circles, `/guidelines`; watch impressions vs the 11/month baseline over 2–3 weeks.
