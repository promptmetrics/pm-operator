# Off-site playbook

**Purpose:** the distribution and measurement loop that runs outside the community itself: subreddits, YouTube, content freshness, and the monthly check on whether any of it is working. Internal ops doc, not public copy.

**Baseline:** before the SEO content fixes, the site sat at roughly 11 impressions per month in Google Search Console (`sc-domain:promptmetrics.dev`, filtered to `operator.`). Everything below is judged against that.

---

## Subreddits

**The one rule that outranks all others: answer first, link never (by default).** A reply that drops a link to the community gets removed, downvoted, or gets the account flagged. A reply that fully answers the question in-thread builds the account history that later makes a rare, relevant link acceptable. Your profile bio carries the community link; that is enough.

**Link only when a thread explicitly asks for more** ("is there a writeup of this?", "where do people discuss this stuff?"). Then one link, to the specific post, with a sentence of context. Never the homepage.

**Targets:**

| Subreddit | Stance | What to do there |
|---|---|---|
| r/hubspot | Helpful, mods tolerate expertise; self-promo removed | Answer workflow/webhook/duplicate questions in full. Highest overlap with the fix-this-workflow content |
| r/revops | Small, practitioner-heavy, wary of promotion | Answer routing/scoring/lifecycle questions. Share numbers freely |
| r/salesops | Small, tolerant of process detail | Lead routing, territory, CRM hygiene questions |
| r/customersuccess | Active, vendor-fatigued | Renewal risk, health scores, digest automation. Never mention tooling you sell |
| r/marketingops | Small, technical | MAP sync, attribution, UTM governance questions |

**Operating rules:**

1. Build 4–6 weeks of pure answer history on one account before posting any link anywhere. Mods check account history.
2. Every answer stands alone: the full answer in the reply, with numbers, following the same convention as the site (front-loaded answer, sources with dates).
3. One account, your real identity. No sockpuppets, no upvote coordination with founding members. A ban on r/hubspot would be disproportionately expensive.
4. Weekly quota: 3 substantive answers across the five subreddits. Quality over volume; each answer should be one you would accept on the community itself.
5. When a question maps directly to a community post (for example a HubSpot duplicate-contact thread), answer fully in-thread, then add: "I wrote the longer version up with the full workflow if useful, link is on my profile." Only if the subreddit's norms tolerate it; when in doubt, omit.

---

## YouTube

**Why:** YouTube videos surface in Google video results and get cited by answer engines. A screen-recorded walkthrough of a real workflow is the cheapest durable asset available, and it points at a community post that already exists.

**First video: the HubSpot cleanup walkthrough**, tied to the post `agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-`.

- **Title pattern:** "Cleaning up 41,000 HubSpot contacts with a coding agent (with a human approval gate)". Lead with the number and the mechanism.
- **Outline (~8–12 minutes):**
  1. The problem in 30 seconds: what was dirty, what it cost (numbers from the post).
  2. The workflow diagram: what the agent does, where the approval gate sits.
  3. Screen recording of the actual run: the agent proposing changes, a human approving a batch.
  4. What broke or nearly broke, and the guardrail that caught it.
  5. Close: "the full writeup with the workflow steps is on Operator Stack, link in the description."
- **Description pattern:** first two lines are a self-contained summary (front-loaded answer, same as the post convention), then timestamps, then the link to the post, then a link to the community. The first two lines are what Google and answer engines read; write them like a post opener.

**Cadence:** one video per month, each one attached to an existing community post. Next candidates after HubSpot: the lead-routing duplicate teardown, the renewal-risk digest fix. Do not script new content for YouTube; record what is already written.

---

## Freshness cadence

**Rule:** nothing on the site goes more than ~3 months without a touch. Stale dates on sources and examples quietly erode both rankings and trust.

**Monthly sweep (30 minutes):**

1. List all posts and pages with their last-touched date. Anything at 10+ weeks goes on the refresh list.
2. For each flagged item, refresh in priority order:
   - **Source dates:** re-check each cited source, update the "checked [date]" strings. This is the cheapest, highest-value touch.
   - **Numbers:** replace any metric that has moved (record counts, time savings, failure rates).
   - **New information:** if the workflow changed since writing, add a short dated update paragraph at the end, not a silent rewrite.
3. Static pages (`/`, `/guidelines`, circle pages): only touch when the underlying product changes; their freshness signal comes from the community around them.
4. After refreshing a post, request indexing in GSC.

**Do not** touch a page just to change its date. Every refresh must change real content; Google discounts cosmetic bumps.

---

## Measurement loop (monthly, first Monday)

**1. Answer-engine checks.** Run these exact prompts in Perplexity and ChatGPT, logged in a spreadsheet (date, engine, cited? yes/no, what was cited):

1. "how to clean up duplicate HubSpot contacts with an agent"
2. "lead routing workflow assigns leads twice"
3. "community for revops operators using coding agents"
4. "renewal risk digest automation"
5. "how to add a human approval gate to an agent workflow"
6. "what is in your revops stack"
7. "operator stack promptmetrics"

The goal is not to be cited for all seven; it is to watch the count move from zero. Note which URL gets cited when it happens (post vs. profile vs. landing) because that tells you which page type is earning trust.

**2. GSC impressions vs. baseline.** Property `sc-domain:promptmetrics.dev`, filter to `operator.`. Baseline is ~11 impressions/month. Watch week over week: impressions first, then clicks, then average position on the queries that appear. Do not judge before 4–6 weeks; new content sits in the sandbox.

**3. "Discussions and forums" module.** In GSC, check Search appearance for "Discussions and forums". It only appears once Google classifies threads as forum content with real discussion. Solved threads with multiple substantive replies are what trigger it. If it has not appeared after 3 months of the engagement ritual, the problem is engagement depth, not markup.

**4. GSC indexing requests.** Any new or refreshed page: request indexing same day.

---

## Monthly checklist

| Task | Done when |
|---|---|
| Answer-engine prompt check | All 7 prompts run in both engines, results logged |
| GSC review | Impressions/clicks/position logged vs. the 11-impression baseline |
| Discussions and forums check | Appearance module checked; status noted |
| Freshness sweep | Nothing on the site older than ~3 months untouched |
| Subreddit quota review | 12 substantive answers posted in the month (3/week) |
| YouTube | One video live (or the next one recorded), description linked to its post |
| Indexing requests | Every new/refreshed URL requested in GSC |
