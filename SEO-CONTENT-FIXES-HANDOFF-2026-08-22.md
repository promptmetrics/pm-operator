# SEO Content Fixes — Session Handoff 2026-08-22

**Status:** plan `SEO-CONTENT-FIXES-PLAN-2026-08-21.md` (rev 2) FULLY EXECUTED — all six phases code/doc-complete and committed on `main` (not pushed): 75821aa (Phase 1 + mint tokens), 843e207 (Phase 2), deb7f29 (Phase 3 + migration 0027), 6aca7a4 (Phase 4), plus a docs commit (plan, handoff, seeds, retrofit drafts, playbooks).

**Remaining = user-side steps, in order:**
1. ~~Apply migration 0027~~ DONE (0027+0028 applied to prod 2026-08-22, verified). Local dev against prod works again.
2. Deploy (push triggers Vercel). Post-deploy curl checks: `/` (200, landing), `/g/fix-this-workflow` (title template + sections), `/guidelines` (200), a `/u/` page (Person JSON-LD), sitemap entries.
3. Run `settings-bio.spec.ts` in CI (writes to DB; never local).
4. Apply the 5 circle descriptions via `/admin/groups` (strings in plan Phase 0 table).
5. Post the two `fix-this-workflow` seeds from `docs/seo/SEED-POSTS.md` (seed 2, then accept its solution reply).
6. Apply the three retrofit bodies from `docs/seo/RETROFIT-DRAFTS.md` (fill the 3 source TODOs first), then curl each meta description + GSC request indexing.

## What was completed

### Phase 0 — content prep (drafts only)
- `docs/seo/SEED-POSTS.md` — two convention-compliant seed posts for `fix-this-workflow` (lead-routing duplicate + renewal-risk digest with a solution reply to accept). **User-side steps still open:** apply the 5 circle descriptions via `/admin/groups` (strings are in the plan Phase 0 table), then post both seeds (seed 2, then accept its solution reply).

### Mint token change (site-wide)
- `packages/ui/src/styles/tokens.css` — mint palette applied to `[data-theme='paper']`: paper `#e4ece2`, paper-2 `#dbe5d8`, paper-3 `#cedbca`, paper-inset `#f2f7f0`, line `#cdd9c8`, line-2 `#b4c6af`, link `#a94d30`/`#8f3d24`.
- **`--pm-on-ink` fixed to `#f4efe7`** for the paper theme (light near-white on colored surfaces; dark theme keeps its own value — don't revert this based on the other block).

### Phase 1 — landing page at `/` — COMPLETE and test-green
- `apps/web/lib/analytics.ts` — `AnalyticsEvent` union gained `'landing_cta_click'`.
- `packages/ui/src/components/Logo.tsx` — `OperatorLockup` rebranded: coral dot + serif "Operator Stack" (retired the `operator.promptmetrics` split). Consumers: `app/(community)/components/Header.tsx:153`, `app/u/[slug]/devcard/page.tsx:236`. `OperatorMark` untouched.
- `apps/web/app/(community)/feed/page.tsx` — JSON-LD block removed (moved to `/`); canonical metadata kept.
- `apps/web/app/sitemap.ts` — `/` entry at priority 1.0 with `LANDING_LASTMOD` constant (bump on copy changes; never `new Date()`); `/feed` dropped to 0.9.
- `apps/web/app/layout.tsx` — default metadata → title "Operator Stack", new description.
- `apps/web/app/landing-copy.ts` (new) — every landing string verbatim from `Landing.dc.html` + handover L1–L5. Exports `LANDING_COPY`, `PROOF_POST_SLUGS` (two real prod slugs), `PROOF_ROW_COUNT = 3`.
- `apps/web/lib/services/landing.ts` (new) — `getLandingData = unstable_cache(compute, ['landing-page-data'], { revalidate: 86400 })`. Worst case 3 **sequential** queries (combined counts SQL, curated slugs, backfill); no `Promise.all`. Import alias note: it's `@/landing-copy` (`@/*` → `./app/*` | `./lib/*`), not `@/app/landing-copy`.
- `apps/web/app/components/LandingCta.tsx` (new) — client coral Button asChild → `/register`, fires `trackEvent('landing_cta_click', { placement })`.
- `apps/web/app/page.tsx` (rewritten) — replaces the 308: full mint landing (header / hero+stats rail / personas / proof rows / five circles / first week / closing CTA / footer), canonical = bare origin (must match sitemap byte-for-byte), WebSite JSON-LD script.

**Verified green:**
- `pnpm typecheck` — clean.
- `pnpm vitest run e2e/landing-jsonld.vitest.ts e2e/query-budget-units.vitest.ts` — 21 passed.
- `npx playwright test landing.spec.ts` — 5 passed against a local dev server (read-only; prod-backed `.env.local` reads are safe — the landing page never writes).
- Dev server was stopped after the run; `lsof -iTCP:3000` before starting another (memory: e2e-dev-server-port-trap).

## What is left

### Phase 2 — circle title template + fix-this-workflow sections — COMPLETE (commit 843e207)
- `page.tsx` generateMetadata: title/OG/Twitter → `${group.name} — Operator Stack community`.
- New `apps/web/lib/circle-content.ts` per-slug map (fix-this-workflow entry, W1–W3 verbatim) + `CircleContentSections.tsx` (HowItWorks / ChecklistCard / EmptyState / ListFooter).
- `FeedPage` gained `emptySlot` (unfiltered empties only) + `listFooterSlot`; `checklistSlot` doubles as the how-it-works slot. Checklist card prepended to railSlot.
- Verified: tsc clean, 21 vitest, 2 ad-hoc Playwright (sections render; footer hidden when empty; plain circles unaffected), 5 landing Playwright; screenshot eyeballed. Ad-hoc spec deleted after run.
- Note: header description still shows the old DB string — Phase 0 admin-groups update is a user-side step, still open.

### Phase 3 — bio feature — CODE COMPLETE; migration APPLIED TO PROD 2026-08-22
- Migrations `0027_dapper_the_fallen.sql` (enum `point_event_type += 'profile_bio'` in guarded `DO $$ … pg_enum … $$;` + users += linkedin_url/github_url/headline) and `0028_profile_bio_index.sql` (partial unique index). **Split required:** the index predicate resolves the new enum value, which must be committed in an earlier transaction (55P04 — the 0010/0011 precedent); drizzle-kit had emitted them in one file. Second `db:generate` quiet, snapshot chain intact. Applied to prod (2 applied), verified: enum value, 3 columns, index, journal rows.
- Contracts: `PROFILE_BIO` + weight 5 (points-contract test updated); `patchMeRequestSchema` += linkedinUrl/githubUrl/headline; `/me` GET exposes `bioBonusEarned` (optional field, GET-only lookup); `userProfileDetailSchema` += headline/linkedinUrl/githubUrl.
- `awardProfileBio` in lib/services/points.ts (own existence check, unique index is race guard); called from `updateUserProfile` (≥50 trimmed chars, try/catch logs, never fails save) and `saveOnboardingStep1` (writes aboutMe only when non-empty, then awards).
- `components/BioLengthMeter.tsx` (settings/onboarding variants; onboarding earned string keeps its em dash — the documented exception).
- Settings: headline input, About me card (S1 helper, badge states, Northwind placeholder, meter), Links card (S2 helper, mono inputs), "View public profile →". Mockup sidebar NOT shipped (sections don't exist — design debt per plan).
- Onboarding: bio card in Step1Focus (+5 pts pill, O2 helper, 4-row textarea), "Posting guidelines" links in step 1 + Step3Primer. No "Skip for now" on step 1 — the task is required by the onboarding-complete logic.
- Profile: headline under name, in/gh links (`rel="me noopener"`, stripped URL), `buildProfileJsonLd` Person (@id {url}#person, description from bio, sameAs) in site-jsonld.ts + script on /u/[slug].
- Tests: `profile-bio-award.vitest.ts` (4, DB-free mock drizzle, GREEN); `settings-bio.spec.ts` (written, CI-ONLY — writes to DB; never run locally).
- Green: workspace typecheck (6 pkgs), 27 vitest. `pnpm lint` for web is PRE-EXISTING broken (`next lint` removed in Next 16, no flat eslint config) — not caused by this work.
- NOT verified: real-DB rendering of settings/onboarding/profile (blocked on migration; prod users table lacks the new columns until 0027 runs).

### Phase 4 — /guidelines page — COMPLETE (commit 6aca7a4)
- `apps/web/app/(community)/guidelines/page.tsx` (static, own metadata/canonical) + `guidelines-copy.ts` (all strings verbatim, G1–G6 applied — mockup already had all six "after" strings).
- Layout: sticky "On this page" aside (01–05 anchors), coral New post card → /post/new, five rule sections with artifacts (Don't/Do cards, heading pairs, number chips, citation card, one-line closer), footer CTA row. "See a post that follows all five →" links to /feed (PROOF_POST_SLUGS are bare slugs, no static canonical post URL).
- Nav: LeftRail.NAV_ITEMS + Header MOBILE_NAV += Guidelines (after Leaderboards); CreatePostForm gains "Posting guidelines" link; sitemap `/guidelines` at 0.5 with `GUIDELINES_LASTMOD = 2026-08-22`; landing header/footer already linked it from Phase 1.
- **Open copy question for Izzy:** rule 02 paragraph 2 in the mockup still has an em dash ("…140–170 words — one question…") that the handover marked "verified, no change". Shipped verbatim per locked-copy rule; flag as a possible handover oversight.

### Phase 5 — retrofit 3 flagged posts — DRAFTS COMPLETE (uncommitted, user applies)
- `docs/seo/RETROFIT-DRAFTS.md` — full rewritten bodies for: `agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-` (whats-in-your-stack), `the-outcome-measured-mandates-that-actually-worked` (the-watercooler), and the typo post `i-built-a-cool-skill-help-you-with-objection-handling` (make-it-stick, author Ranya Barakat — "I's really hard" → "It's really hard" fixed in the first 47 chars).
- All original numbers preserved, zero em dashes, question H2s, 40–60-word front-loaded answers. **3 source TODOs need real URLs from the owner before applying** (HubSpot gate claim, Cognizant interview link, LAER provider link). Slugs/titles unchanged.

### Phase 6 — docs — COMPLETE (uncommitted)
- `docs/seo/ENGAGEMENT-PLAYBOOK.md` — 24h substantive-reply ritual (number/source/counter-example, matches Guidelines rule 05), question→Solved motion (+25), founding-member recruiting (5 named roles, ≥50-char bio + links → Person JSON-LD sameAs), weekly checklist.
- `docs/seo/OFFSITE-PLAYBOOK.md` — 5 subreddits with answer-first/no-link-drop rules, YouTube plan (HubSpot cleanup walkthrough first), <3-month freshness cadence, measurement loop (7 Perplexity/ChatGPT prompts, GSC vs 11-impressions baseline, "Discussions and forums" module), monthly checklist.

## Copy rules (locked)
- No em dashes in newly authored brand copy (colons/periods). Exceptions: `BioLengthMeter` counter strings (ship as mockupped) and title-tag separators (`—` in FEED_TITLE / circle template).
- Brand strings = character-for-character from the copy handover / mockups (length-checked); "coding agents", never "AI".

## Traps reminder
- Pool = 3: ≤3 concurrent queries, sequential in services; CI E2E is serialized.
- Any App Router page touching `createServiceDb()` must stay force-dynamic; DB access for the landing rides inside `unstable_cache`, never page-level `revalidate`.
- Local Playwright specs do NOT clean up vs prod DB — keep specs read-only (landing.spec.ts pattern) or run them in CI only.
- Gateguard: first Write/Edit per path needs the 4 facts, then retry the identical call.

## Git state at handoff
Committed on `main` (not pushed): 75821aa (Phase 1 + mint tokens), 843e207 (Phase 2), deb7f29 (Phase 3 + migration 0027, DEPLOY ORDER: migrate prod before deploying), 6aca7a4 (Phase 4), docs commit (plan, handoff, docs/seo/*). Still uncommitted: `faq.json`, `design/`, `update/`, vercel.json M, next-env.d.ts + tsbuildinfo M (build artifacts) — all pre-existing, intentionally left out.
