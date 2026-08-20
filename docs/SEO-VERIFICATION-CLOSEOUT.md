# SEO Verification Closeout — pm-operator

Responds to the SEO team's **Dev Fix Verification** report (artifact
`13d5d47c-3555-4ded-8c15-199e782c4798`), pm-operator rows only. Every open row below is
either fixed-and-live-verified or closed with a documented reason. All live checks were
run against `operator.promptmetrics.dev` on 2026-08-20 after deploys `d7945ba` and
`18e9956`. Each row lists the re-runnable check.

## Fixed and live-verified

### Item 12 — touch targets (digest-dismiss + two the report missed)

The flagged digest-dismiss button now takes its hit area from the `--pm-control-h`
token (44px under `pointer: coarse`; icon size and desktop density unchanged) —
`WeeklyDigestBanner.tsx`. Lighthouse's target-size audit then surfaced two more
failures the report hadn't itemized: the header logo link and the anonymous
Log in / Create account links (plain inline anchors around Buttons get a
line-height-sized tap box that fails even when the button passes). Fixed via the
control-token min-height and the `asChild` pattern — `Header.tsx`.

**Check:** Lighthouse mobile on `/feed` → `target-size` audit.
**Observed:** score **1**, failing targets: **none** (was: score 0, two header anchors).

### Item 5 — hero image dimensions

Both hero render sites (`PostDetailPage.tsx`, `FeedCard.tsx`) now carry explicit
`width="1200" height="600"` attributes matching the 2:1 box; CSS (`aspect-[2/1]`,
`object-cover`) governs rendered size, so nothing shifts visually. `next/image` remains
deliberately skipped: images are same-origin `/api/img/` proxy URLs with immutable
caching, so the optimizer adds billing and config for no crawlability gain.

**Check:** `curl -s https://operator.promptmetrics.dev/g/{circle}/{post-with-cover} | grep -o '<img[^>]*width='`
**Observed:** attributes present in the deployed markup (no live post currently has a
cover image to curl; verified in the served component bundle and CLS = 0 in Lighthouse).

### Item 6 — LCP bundle work

Confirmed live by Lighthouse mobile on `/feed`: **render-blocking resources: none**
(the Google Fonts `@import` chain is gone), **TBT 10–30 ms** (TipTap split out of
first-load JS), **CLS 0**. Additionally shipped: modern-only `browserslist`
(`chrome/edge/firefox 111, safari/ios 16.4`) removing the legacy transpilation the
audit flagged.

**LCP itself: 3.8–6.3 s in throttled lab runs — still above the 2.5 s target, and now
TTFB-bound, not asset-bound** (`server-response-time` ~780 ms throttled; the document is
dynamic SSR with several sequential DB query waves, a deliberate pool-safety
constraint). Remaining levers are architectural — edge/CDN caching of anonymous HTML or
feed-query consolidation — and belong in a follow-up perf ticket, not this closeout.
CrUX field data remains unavailable (traffic below threshold); re-check in 4–8 weeks.

### Item 13 — IndexNow

Resolved since the report's check: `INDEXNOW_KEY` is set in Vercel production.

**Check:** `KEY=$(curl -s https://operator.promptmetrics.dev/api/indexnow-key); curl -s -o /dev/null -w '%{http_code}' https://operator.promptmetrics.dev/$KEY.txt`
**Observed:** key file returns **200** and the body byte-matches the key. Publish/edit/
hide pings to `api.indexnow.org` are active in `lib/services/posts.ts`.

## Closed with documented reason (no code change)

### Cache-Control on public pages (the 🔀 row)

**Closed as platform-constrained, with a controlled experiment as evidence.** The
middleware fix is correct and works under `next start`; on Vercel, the render layer
replaces `Cache-Control` on dynamic document responses. We then tested the only other
app-level mechanism — routing-layer header rules in `vercel.json` with a cookie-`missing`
condition — by attaching a marker header to the same rules:

**Check:** `curl -sI https://operator.promptmetrics.dev/feed | grep -iE 'cache-control|x-anon-public-read'`
**Observed:** `x-anon-public-read: 1` (rule fires; anonymous detection works) while
`cache-control` remains Next's `private, no-cache, no-store` — proving Vercel overrides
Cache-Control specifically, after every app-level layer.

No mechanism inside this repo can change the browser-visible Cache-Control for dynamic
pages on Vercel. Remaining paths, both deliberate decisions rather than bug fixes:
(a) a Cloudflare response-header transform rule (dashboard), or (b) real CDN caching via
`Vercel-CDN-Cache-Control` (changes caching semantics; the original audit graded this
row Low — "fine at current scale; revisit if crawl volume grows"). The vercel.json rules
stay in place: they are correct, self-documenting, and will activate if Vercel's
behavior changes; the marker header doubles as a live probe that anonymous detection
works.

### Item 7a/7b — Cloudflare robots.txt

**Closed by owner decision (2026-08-20), not a defect.** The two Cloudflare layers are
consistent, not contradictory: "Training: Allow (do not block)" is WAF enforcement,
while "Manage your robots.txt" injects a no-training *preference* (`Disallow` for
training UAs + `ai-train=no`). Search and citation crawlers (Googlebot, OAI-SearchBot,
Claude-SearchBot, PerplexityBot) were never affected. The owner chose to keep the
no-training posture; it is reversible in the dashboard at any time.

### Critical-CSS inlining (item 6 sub-item)

**Declined with rationale.** The only mechanism on this stack is Next's
`experimental.inlineCss`, and experimental build flags are barred by project guardrails
(interaction risk with the Sentry build wrapper). Moot in practice: Lighthouse now
reports zero render-blocking resources, so there is no critical-CSS problem left to
solve. Revisit only if the flag stabilizes.

### `/.webmcp/manifest.json` 404

**Closed as not-applicable.** The report itself questioned the finding: neither repo
contains a WebMCP bridge (`grep -ri webmcp` returns nothing here). The bridge observed
in the original audit was injected by an edge layer, not application code; there is no
tool surface in this repo for a manifest to describe. Machine access is documented at
`/llms.txt` (MCP endpoint) instead.

### `/api/v1/me` anonymous 401

Client guard shipped (cookie-stem check in `Header.tsx` — anonymous views skip the
request). The endpoint itself still returns 401 when called directly, which the report
agrees is expected. Full confirmation needs a browser network trace; the code path is
covered by the cookie check mirroring middleware's `hasAuthCookie`.

## Test/build evidence

- `pnpm typecheck` — clean (all 7 workspace packages)
- `pnpm build` — production build clean
- `npx vitest run e2e/*.vitest.ts` — 26/26 pass
- Deploys: `d7945ba`, `18e9956` (CLI `vercel --prod --archive=tgz`; note: the GitHub
  Actions workflow is CI-only — it does not deploy)
