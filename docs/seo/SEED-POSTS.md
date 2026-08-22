# Seed posts — fix-this-workflow

**Purpose:** two convention-compliant teardowns for the `fix-this-workflow` circle, matching `FixThisWorkflow.dc.html` (seeded state). Post them personally via the UI so authorship is honest and `topic_created` points accrue naturally.

**How to post:**
1. Feed → fix-this-workflow → New post, type **question**.
2. Paste the body below verbatim (edit freely — this is your war story, adjust details to what actually happened).
3. Add the tags listed under each post.
4. Seed 2: after posting, add the solution reply yourself (or wait for a real one) and accept it, so the Solved chip renders.

**Convention checklist applied to both:** answer in the first 40–60 words · headings are the questions people would type · numbers over adjectives · what already got ruled out · the failure named plainly · no em dashes.

---

## Seed 1 (open question)

**Title:** Our lead-routing workflow assigns every inbound form fill twice: where is the duplicate coming from?

**Tags:** `hubspot`, `routing`, `webhooks`

**Body:**

The duplicate comes from a retry with no idempotency key between our form handler and HubSpot's workflow webhook. That is my best hypothesis. Over five months it produced 1,900 double-assigned leads, and twice two reps called the same prospect within an hour. Here is every step, in order, and the three places I think it forks.

### What does the workflow actually do today?

Nine steps, two webhooks. A form fill on our site hits a Cloudflare Worker (step 1), which writes to a staging table (step 2) and POSTs to HubSpot's inbound webhook (step 3). HubSpot creates or updates the contact (step 4), fires its own workflow webhook to our router (step 5), which enriches against Clearbit (step 6), scores (step 7), assigns to a rep (step 8), and writes the assignment back to HubSpot (step 9).

The worker retries the step-3 POST on any non-200 with exponential backoff. It does not send an idempotency key, and HubSpot's create-or-update endpoint treats each POST as a fresh event when no key is present (HubSpot webhooks API docs, checked 18 Aug 2026). If step 3 returns a 200 but the response is lost to a network blip, the retry creates the same contact a second time within about 4 seconds.

### What does it cost when it breaks?

1,900 double-assigned leads in five months, roughly 3% of inbound volume. Each duplicate costs a rep about 6 minutes of untangling on average, so around 190 rep-hours total. The twice-in-five-months "two reps call the same prospect within an hour" failure is the one that shows up in NPS comments.

### What have I already ruled out?

Duplicate form submissions from the browser: ruled out, the staging table shows one row per pair. HubSpot's native duplicate detection: it catches these about 40% of the time because the two contacts arrive with different `hs_analytics_source` values. The Clearbit enrichment call: single-fire, verified in logs.

### Where do I think it forks?

Three candidates, ranked by my confidence: (1) the step-3 retry without an idempotency key; (2) HubSpot's step-5 workflow webhook firing twice for contacts created within the same second, which its docs list as "at least once" delivery; (3) our router re-scoring on any property change, including the write-back in step 9. I have not been able to reproduce (2) in a sandbox.

What am I missing? If you have run HubSpot routing webhooks at this volume, I would take any of: a number from your own duplicate rate, a docs link I have not read, or a reason candidate (2) is more likely than I think.

---

## Seed 2 (ends solved)

**Title:** Why does our renewal-risk digest go quiet for a week every quarter-end?

**Tags:** `zendesk`, `digest`, `scheduling`

**Body:**

The digest goes quiet because our CRM's nightly export job is still running when the agent fires at 07:00 on the first Monday after quarter-end, and the API read times out silently. Three misses a year, always the same weeks. The fix was moving the run to 09:30 and adding a hard failure alert instead of skipping the digest.

### What was the workflow actually doing?

Every Monday at 07:00 an agent pulls open Zendesk tickets older than 14 days, Gong calls flagged "at risk" in the last 30 days, and CRM renewal records due in the next two quarters. It assembles a one-page digest per account owner and posts it to Slack by 07:45. CS leads read it in the Monday standup at 08:30.

Every step had error handling except the CRM pull. When the CRM API did not answer in 30 seconds, the agent logged a warning, built the digest from Zendesk and Gong only, and posted it anyway labeled "renewal data: partial". Nobody reads a digest labeled partial, so it looked like the digest never arrived.

### What did the misses cost?

Three Mondays a year, each one the first Monday after quarter-end. CS lost about 40 minutes of prep per miss and, in Q2, a renewal slipped to the following quarter because the 90-day risk signal sat in the CRM unseen for nine days. That one miss made the scheduling problem a revenue problem.

### What did we already rule out?

The agent's cron schedule: correct, fires every Monday without exception. Zendesk and Gong rate limits: clean logs for every miss week. The Slack webhook: posted correctly on the miss weeks, that is how we knew the digest rendered at all. The only variable that lined up with all three misses was the CRM export job, which our data team confirmed runs 02:00 to ~08:15 on quarter-end Mondays.

### What fixed it, and what would I not do again?

Moving the agent run to 09:30 fixed the content problem. The fix that mattered more was failure behavior: a CRM timeout now fails the whole run and pages whoever owns the digest that week, instead of shipping a partial digest nobody trusts. What I would not do again is let a data-assembly job degrade silently. "Partial" output from an agent looks worse than no output.

**Solution reply to post, then accept:**

> Confirmed the same pattern on our side. Our CRM (Salesforce) runs its full export 01:00–07:30 on quarter-close Mondays and API latency roughly triples during the window. Two things fixed it for us: (1) query against the replicated warehouse instead of the live API for anything read-only, which removed the dependency on the export window entirely; (2) dead-man alerting on the digest post itself. If the Slack post has not landed by 08:00, the run fires a page. The 09:30 move is a fine stopgap, but the replica read is the durable fix.
