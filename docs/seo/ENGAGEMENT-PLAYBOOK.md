# Engagement playbook

**Purpose:** the daily and weekly operating rhythm that keeps the community alive, moves questions to Solved, and recruits the founding members whose profiles carry E-E-A-T weight. Internal ops doc, not public copy.

**Why it matters for search:** Google surfaces forum threads in the "Discussions and forums" module when threads look like real conversations with resolutions. An open question with zero replies reads as a dead forum. A question with three substantive replies and an accepted solution reads as a living one. Points are the internal scoreboard: post +10, comment +5, solution accepted +25, profile bio (≥50 chars) one-time +5.

---

## The 24-hour substantive-reply ritual

**Rule:** no open question sits unanswered for more than 24 hours. You (Izzy) are the reply of last resort. Founding members, once recruited, share the load, but the 24-hour clock is yours.

**What counts as substantive** (matches Guidelines rule 05): a reply that adds at least one of:

- a number from your own experience ("we saw the same failure roughly 3% of inbound volume")
- a source, with the date you checked it ("HubSpot webhooks docs, checked 22 Aug 2026, list at-least-once delivery")
- a counter-example ("this did not hold for us: our duplicates came from the enrichment step, not the webhook retry")

A reply that only agrees, only sympathises, or only asks a clarifying question does not count. Clarifying questions are fine, but pair them with one of the three.

**Daily ritual (10 minutes, morning):**

1. Open the feed, filter to `fix-this-workflow` and `where-do-i-start` first (highest question density).
2. Any question older than 20 hours with no substantive reply: reply yourself.
3. Any question with replies but no accepted solution: nudge it forward (see next section).
4. Skim `whats-in-your-stack`, `make-it-stick`, `the-watercooler` for anything you can add a number to.

**Reply templates.** Skeletons, not scripts. Rewrite the bracketed parts in your own voice every time; two replies that read identical undermine the whole convention.

- *Number reply:* "We hit this too. [What happened, one sentence]. Our number: [metric + time window]. What moved it for us was [one action]."
- *Source reply:* "[Answer in one sentence first.] [Source name] covers this: [the relevant fact]. Checked [date]. The part people miss is [detail]."
- *Counter-example reply:* "I would push back on [claim]. We ran the same setup and saw [different outcome] instead. The difference, I think, is [variable]."

Every template front-loads the answer in the first sentence, matching rule 01.

---

## Working a question to Solved (+25 pts)

An accepted solution is worth +25 to the solution author, but the real prize is the Solved chip: it is the strongest signal that the thread belongs in "Discussions and forums" surfacing, and it is what a searcher wants to see before they trust a small forum.

**The motion, per open question:**

1. **Answer or attract an answer.** Either you reply substantively, or you pull in someone who can ("@name, you ran HubSpot routing at this volume, what was your duplicate rate?").
2. **Converge in-thread.** Once a reply actually addresses the failure, reply to confirm it against the original post's numbers. Do not let the thread tail off into adjacent topics.
3. **Ask for the accept.** If the OP has not accepted within 48 hours of a working answer, nudge once, plainly: "Did the 09:30 move fix it on your side? If so, mark it solved so the next person finds it." One nudge, never two.
4. **Self-solve when honest.** If you asked the question and later fixed it yourself, post the fix as a reply and accept it. Seed 2 in `SEED-POSTS.md` is the model. Never accept a placeholder reply to force the chip; an accepted non-answer is worse than an open thread.

**Weekly target:** zero questions open older than 7 days. Either solved, or closed with an honest "we never reproduced this" summary reply.

---

## Founding-member recruiting (3–5 people)

**Why:** five real operator profiles with bios and outbound links give the site five `Person` JSON-LD entities with `sameAs` to LinkedIn/GitHub. That is the E-E-A-T layer: named humans, verifiable elsewhere, attached to the content. It also spreads the 24-hour reply load.

**Named-role targets** (recruit one per row, from people you already know):

| Role | Circle they anchor | Why them |
|---|---|---|
| RevOps lead | whats-in-your-stack | Stack questions are the highest-volume thread type |
| CS director | fix-this-workflow | Renewal/digest/health-score war stories |
| Marketing-ops manager | fix-this-workflow | MAP sync and attribution breakage |
| Sales-ops analyst | where-do-i-start | Onboards newcomers, answers starter questions |
| Ops-curious founder | the-watercooler | Keeps the casual circle warm |

**The ask** (send personally, one-to-one, never a blast):

> I am building a small community for ops operators who orchestrate their tools with coding agents. Real workflows, real numbers, no vendor pitch. I want five founding members before I open it wider. The commitment: one intro post and one substantive reply a week for a month. Interested?

**Onboarding path per person:**

1. They register and complete onboarding.
2. Bio of ≥50 characters in Settings (unlocks the one-time +5; the bio meter shows the countdown). The bio should state role, company type, and stack: it renders on their `/u/` page.
3. They add LinkedIn and GitHub links in Settings. These render with `rel="me"` and feed the `sameAs` array in the `Person` JSON-LD on their profile.
4. Verify: curl their `/u/[slug]` page and confirm the `Person` JSON-LD block includes `sameAs`.

**First-post prompt per role** (hand them the prompt, not the post):

- RevOps lead: "What is in your stack right now, and which integration breaks most often? Numbers, not adjectives."
- CS director: "Walk through one renewal-risk workflow you run with a coding agent: what it does, what it cost when it broke."
- Marketing-ops manager: "Describe one sync or attribution failure you fixed, with the before/after numbers."
- Sales-ops analyst: "What should a new ops hire automate first, and what should they not touch yet?"
- Founder: "What did you hand to a coding agent that you swore you would never automate?"

Each first post must follow the convention: front-loaded answer, question headings, numbers, sources with dates.

---

## Weekly checklist

| Day | Task | Done when |
|---|---|---|
| Mon | Reply sweep (24h rule) | No unanswered question older than 24h |
| Mon | Solved nudges | Every answered-but-unaccepted thread nudged once |
| Tue | Founding-member outreach | 1–2 personal asks sent (until 3–5 committed) |
| Wed | Post one original question or teardown | New thread live, convention-compliant |
| Thu | Reply sweep | No unanswered question older than 24h |
| Fri | Profile audit | New members have ≥50-char bio + links; `/u/` JSON-LD verified |
| Fri | Weekly score check | Open questions older than 7 days: zero |
