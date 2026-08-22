# Retrofit drafts — flagged posts (Phase 5)

**Purpose:** rewrite drafts for the three posts flagged in `SEO-CONTENT-FIXES-PLAN-2026-08-21.md`, brought in line with the community convention (front-loaded answer in 40–60 words, question-phrased H2s, ~140–170 word sections, numbers preserved, per-claim sources, no em dashes, "coding agents" not "AI").

**DRAFTS ONLY.** The site owner applies these via the normal edit flow. Nothing here has been pushed to the site. Slugs and titles stay unchanged; only bodies change.

**How to apply:**
1. Open the post in the UI as its author (or admin edit).
2. Replace the body with the fenced block below, verbatim after review.
3. Check the "Owner apply notes" line for any source URL that still needs a real link before publishing.

Bodies were extracted from the public rendered pages on 22 Aug 2026, so inline formatting (bold, exact list markup) may differ slightly from the stored markdown. `/guidelines` still 404s at draft time; conventions below follow the posting-guidelines contract and `SEED-POSTS.md`.

---

## Post 1

- **Slug:** `agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-` (truncated in the sitemap exactly like this; URL below works)
- **URL:** https://operator.promptmetrics.dev/g/whats-in-your-stack/agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-
- **Current title:** Agent-powered HubSpot cleanup, with a human approval gate on every write

**Diagnosis:** the actual answer (two tools, human approval gate on every write) is buried behind a problem statement, and the post is one wall of text with no question headings. All real numbers (44 sub-agents, 76 tools, 5-tool safety layer, 15 minutes, 90 days) are present but unstructured. One vendor claim ("where HubSpot's own agent tooling leaves the gate open") has no primary source.

**Rewritten body:**

```markdown
I built two open-source tools that let a coding agent clean up HubSpot while a human approves every write before it lands. Nothing touches your CRM until you approve that exact change, and the gate cannot be switched off. Both are beta, free, and set up in about 15 minutes with test data.

## Why did I build the guardrails before the agent?

Most of you run HubSpot plus three or four other tools, and the jobs you keep putting off are the ugly ones. Duplicate contacts. Stale deals. A pipeline nobody trusts.

That is perfect agent work, except for one thing: an agent with write access to your CRM is a terrifying idea. One bad merge and your reporting is fiction. One wrong bulk edit and you spend a weekend in the recycle bin. So I built the guardrails first, then let the agent loose.

The rule in both tools is the same: nothing touches your CRM until you approve that exact change. It is not a setting you can switch off. It is the only way through. Every design decision below follows from that rule.

## What does the Claude Code plugin do?

The first tool is hubspot-claude, a Claude Code plugin. You type "find duplicate contacts and merge them," and it routes the job to one of 44 specialist sub-agents instead of one generalist guessing at your data model. That routing matters, because HubSpot objects have sharp edges: merging contacts is not the same job as merging companies.

It shows you a preview of every change before anything happens. You approve, it executes, and then it verifies that the change actually landed. For destructive jobs it makes you enter the number of records you expect it to touch, and it rechecks that count when it runs. If the count comes back different, you find out immediately, not at quarter-end.

Big multi-step jobs resume where they left off if the session drops, so a cleanup of a few thousand records does not die halfway because your laptop closed.

## What does the MCP server add?

The second tool is hubspot-mcp, an MCP server that runs in Claude Cowork. It exposes 76 CRM tools plus a 5-tool safety layer on top.

Every write previews first. Every approved change records an undo snapshot before it executes, so a mistake is a rollback, not a restore-from-export. Everything lands in an audit log, which means you can answer "who changed this deal and when" without spelunking through HubSpot's activity feed.

The safety layer is the part I care about most. The 76 tools are table stakes; any integration can read and write records. The safety layer is what makes it survivable: a preview before every write, an undo snapshot on every approved change, and an audit trail for everything. Pick the plugin if you live in Claude Code; pick the server if your team works in Cowork.

## How do you try it in 15 minutes?

You do not need real data, and you should not use any.

- Create a free HubSpot developer test portal.
- Install one of the two tools; each README has the steps.
- Give it a hypothetical business and ask it to seed the portal with sample records.
- Then give it a real job: "find and merge duplicates" or "flag deals with no activity in 90 days."
- Watch the preview, approve, and check that the audit log matches what you approved.

Never point either tool at your live portal. Both are beta, and finding the rough edges is the point. If it does something unexpected on test data, that is a bug report I can act on. If it does something unexpected on live data, that is a bad weekend. The 15 minutes above is the whole cost of finding out whether this fits your workflow.

## What do I want from you?

The spots where it falls over. Weird portal setups, jobs it routes to the wrong agent, previews that do not match what actually happened. Post what breaks in the comments, and I will fix it in the open.

Repos:

- Claude Code plugin: https://github.com/promptmetrics/hubspot-claude
- MCP server: https://github.com/promptmetrics/hubspot-mcp

The full write-up on why the approval gate matters more than the feature list, and where HubSpot's own agent tooling leaves the gate open, is on my LinkedIn: https://www.linkedin.com/pulse/i-let-ai-run-my-hubspot-cant-change-anything-until-say-izzy-aly-dntve

Sources: the tool counts (44 sub-agents, 76 CRM tools, 5-tool safety layer) are documented in the two repos linked above. TODO(owner): the claim about HubSpot's own agent tooling leaving the gate open needs a primary HubSpot doc or changelog link; none could be determined from the original post, so it currently points only at the author's LinkedIn write-up.
```

**Owner apply notes:** add a real HubSpot docs/changelog URL for the "leaves the gate open" claim (or soften the claim); repo links already serve as primary sources for the tool counts.

---

## Post 2

- **Slug:** `the-outcome-measured-mandates-that-actually-worked`
- **URL:** https://operator.promptmetrics.dev/g/the-watercooler/the-outcome-measured-mandates-that-actually-worked
- **Current title:** The outcome-measured mandates that actually worked

**Diagnosis:** strong opening line, but the post then runs as a single narrative with no headings, mixing the failure case, three success cases, and the framework. Every number (8 weeks, 30%, 4.2 to 2.8 days, CSAT 4.1 to 4.6, 95%, 60 days, 22%) needs to survive; sourcing is one blanket citation at the end instead of per-claim. The cited article title keeps "AI" as a proper noun; body copy now says "coding agents".

**Rewritten body:**

```markdown
The mandates that worked measured an outcome, not activity. DataNumen cut ticket resolution from 4.2 days to 2.8 by aiming at one number: 30% of tickets agent-assisted. The mandates that died counted logins and screenshots. Here are three that held, one that backfired, and the boring framework behind all of them.

## Why do activity mandates backfire?

Most coding agent mandates die within eight weeks. The ones that hold have one thing in common, and it is not the tool. It is the yardstick leadership picked before the rollout started.

Measure activity, and you get theatre. Ankita Pathak at OneMetrik required daily ChatGPT use, verified by a Slack screenshot before 4pm. It backfired by month two and was scrapped after eight weeks. Her words: people used it daily just to tick the box.

Notice what none of the survivors counted. Tokens. Logins. Prompt logs. Cognizant's CEO called token consumption a vanity metric back in June, and he is right. It measures effort, not results. A screenshot has a fake version. A closed ticket does not. It either closed faster or it did not. There is nothing to game.

## What did the three that held actually measure?

DataNumen. Chongwei Chen set one target: 30% of tickets agent-assisted, tied to a number his support team already tracked. Ticket resolution went from 4.2 days to 2.8. CSAT went from 4.1 to 4.6. No new dashboard.

Simply Noted. Rick Elmore tracked proposal turnaround, ticket closure speed, and revision rounds. Marketing output roughly doubled without adding headcount. His line is the one I keep repeating: the mandate without the scaffolding is just pressure.

Tabula. Carlos Rios moved 95% of blog drafting to a coding agent. A post went from roughly a week to roughly an hour of prompting and editing. Every draft still passes a human before it is published.

Three different teams, three different jobs, one pattern: a number the team already tracked, and a human still accountable for the result.

## Why does the framework survive contact with a real team?

The framework is boring, which is why it works. Pick one slow, repeated task your team already complains about. Measure it now, before anything changes. Roll out the agent with a human review gate. Check the same number at four to six weeks. That is the whole thing.

The uncomfortable part is that the mandates that work barely mandate coding agents at all. Chen never told anyone how to use the tools. He told them which number had to move. How the team moved it was their problem to solve, and they solved it because the target was theirs, not a dashboard imposed from above. Four steps, no new dashboard, no prompt police. Any ops lead can run it this quarter.

## Where does this still leak?

Outcome metrics are slow to read. You will not know at week one, and that is a real cost when leadership wants a signal by Friday.

Speed metrics can also lie by omission. Liu Peng at ReelPulse doubled shipping velocity in 60 days, then watched cloud costs jump 22% in a single month because juniors were shipping agent-written code they had not verified. Speed was up. The metric was just too narrow. Pairing velocity with a cost or defect number would have caught it sooner.

Pick a number that catches the failure mode, not only the win. If your number can go up while quality quietly burns, you have built a better screenshot.

So, one question. What is the single number you would measure before you rolled an agent out to your team? Drop it in the comments. If you could screenshot it, it is the wrong one.

Tell me where I am wrong.

Sources: all numbers and quotes above are from Kristen Kerr, "AI Mandates: Hit or Miss? Leaders Tell All," The Digital Project Manager, July 2026: https://thedigitalprojectmanager.com/pmo/ai-mandates-hit-or-miss-leaders-tell-all/ and full write-up: https://www.promptmetrics.dev/blog/ai-mandate-failure
```

**Owner apply notes:** the Cognizant CEO "vanity metric" line is assumed to come from the same Kerr article as the other numbers; if the owner has the original June interview, link it inline on that sentence. No other source gaps.

---

## Post 3 (typo post)

- **Slug:** `i-built-a-cool-skill-help-you-with-objection-handling`
- **URL:** https://operator.promptmetrics.dev/g/make-it-stick/i-built-a-cool-skill-help-you-with-objection-handling
- **Current title:** I built a cool skill help you with objection handling

**Diagnosis:** body opens with "I's really hard", which lands inside the first 155 characters and leaks into the meta description; fixed to "It's really hard" in the first sentence below (title is deliberately left unchanged). Otherwise the post is a conversational wall of text with no front-loaded answer and no headings. Short source post, so some sections land just under the 140–170 word target rather than padding with invented detail.

**Rewritten body:**

```markdown
It's really hard being in the service industry, so I built a Claude skill that coaches you through hard conversations before you have them. It combines the LAER objection-handling framework, Chris Voss's "Never Split the Difference", and "The Art of War", and it role plays the conversation with you until it sticks.

## Why is it so hard to talk about hard things at work?

It's people, people's feelings, how they're showing up at work. Some have good days, some have bad days, and some are the bullies that we experienced in the school corridor, and also the angels and besties. Basically all of that human stuff that we don't really talk about in the work context for some bizarre reason.

What I like to do when I work with my customers is empower them for those hard conversations, because they're not easy. No one likes a confrontation. No one likes that hard talk. No one likes to go deep. And avoiding them does not make them easier. It just means you end up having them unprepared, in the moment, when the stakes are highest.

## What did I build, and what is it based on?

I built a Claude skill that I think might be really helpful for you to be using. I personally was trained on objection handling using the LAER framework, and it helps me tremendously to this day.

What I did when I built this skill is I used LAER as the base, and I also like the approach from Chris Voss from "Never Split the Difference", and I also like things from "The Art of War". So I combined the best of those three worlds into one coaching skill that you can install in your Claude.

Each of the three brings something different. LAER gives you a structure for handling an objection without getting defensive. Voss gives you the tactics for staying calm and curious when the pressure rises. The Art of War gives you the patience to prepare before you ever step into the room.

## How does a practice session work?

When you are preparing for a difficult conversation, it learns the situation with you. It goes through the details, asks questions until it understands what you are walking into, and then it does a role play with you.

After the role play, it asks you for feedback and provides you with feedback of its own. Then it reruns the role play with you, so you can try the same conversation again with the fixes applied. It provides you with sound bites, the short lines you can lean on when your mind goes blank, and a tracking document you can use to practice.

Practicing the hard conversations using the sound bites becomes something really simple, and it makes it stick. That is the whole point: not a script you read once, but reps you can put in before the real conversation happens.

## How do you get the skill?

I hope you enjoy it. If you want the link to the skill, comment "skill" in the comments, and I will send it over. If you try it before a real conversation, I would love to hear how the role play held up against the real thing.

Sources: what a Claude skill is and how to install one: https://github.com/anthropics/skills. LAER, "Never Split the Difference", and "The Art of War" are a training framework and two books, so no vendor links apply. TODO(owner): if you want LAER linked, add the page of the program you trained with.
```

**Owner apply notes:** typo is fixed in the first sentence (inside the 155-character meta window); if the platform caches the meta description, confirm it re-renders after the edit. Optional LAER link needs the owner's real training-provider URL. Sections 1 and 5 run short of 140 words by design; expand only with real detail.
