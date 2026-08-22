// Landing page copy — every user-visible string on `/` lives here.
//
// Source of truth: update/mint/promptmetrics-community-portal-redesign/project/
// Landing.dc.html (pixel target) with the copy-handover replacements L1–L5
// applied (update/promptmetrics-community-portal-redesign/COPY-HANDOVER-
// 2026-08-21.md). Both were length-checked for layout, so edit sparingly and
// never introduce em dashes — brand copy uses colons and periods.
//
// The strings ship character-for-character: the mockup's hero CTA read "Join
// the community — free", rewritten here to drop the em dash while keeping the
// meaning and length.

export const LANDING_COPY = {
  meta: {
    title: 'Operator Stack: the community for ops teams running coding agents',
    description:
      'Operator Stack is a working community for RevOps, CS, and marketing-ops leads: real builds, real numbers, and the parts that broke.',
  },

  header: {
    feed: 'Browse the feed',
    guidelines: 'Guidelines',
    login: 'Log in',
    join: 'Join the community',
  },

  hero: {
    badge: 'A community for operators, not engineers',
    headingLine1: 'You already pay for the tools.',
    headingLine2Pre: "Here's how operators make them ",
    headingEmphasis: 'work together',
    subhead:
      'Operator Stack is a working community for RevOps, CS, and marketing-ops leads who orchestrate the SaaS they already own with coding agents. Real builds, real numbers, and the parts that broke.',
    primaryCta: 'Join the community for free',
    secondaryCta: "Read this week's builds first →",
    statsFootnote: 'Counts recomputed daily from our own database.',
    operatorLabel: 'operators in the community',
    postLabel: 'public builds and teardowns',
  },

  personas: {
    heading: 'Written by people with your job title',
    subhead:
      "Nobody here is shipping a product. Everyone here is orchestrating tools they didn't build.",
    cards: [
      {
        title: 'RevOps managers',
        body: 'Dedupe, routing rules, and pipeline hygiene handled by an agent that reads your CRM instead of another paid connector.',
      },
      {
        title: 'CS directors',
        body: 'Renewal-risk digests and QBR prep assembled from Zendesk, Gong, and the CRM before your Monday standup.',
      },
      {
        title: 'Marketing-ops leads',
        body: "Campaign QA, list hygiene, and attribution stitching without waiting on a data team's sprint.",
      },
      {
        title: 'DTC founders',
        body: 'One person, six SaaS subscriptions, and an agent doing the joining that a headcount used to do.',
      },
    ],
  },

  proof: {
    heading: 'Three builds from this month',
    // Rendered with the live count interpolated: `All ${postCount} posts →`.
    allPostsPrefix: 'All ',
    allPostsSuffix: ' posts →',
  },

  circles: {
    heading: 'Five circles',
    subhead: "Pick the one that matches what's broken this week.",
    browseAll: 'Browse all circles →',
    // L1–L5 from the copy handover, keyed by the five production slugs.
    items: [
      {
        slug: 'where-do-i-start',
        blurb:
          'First steps for ops leads adopting coding agents: what to automate first, and what to leave alone.',
      },
      {
        slug: 'whats-in-your-stack',
        blurb:
          'Tools, MCP servers, and integrations operators actually run: honest trade-offs and stack teardowns.',
      },
      {
        slug: 'fix-this-workflow',
        blurb:
          'Bring a broken pipeline and the community helps fix it. Real teardowns, with concrete numbers.',
      },
      {
        slug: 'make-it-stick',
        blurb:
          'Adoption, habits, and change management: how teams keep using the automations they ship.',
      },
      {
        slug: 'the-watercooler',
        blurb:
          'Introductions, founder stories, and off-topic talk. The people behind the builds.',
      },
    ],
  },

  firstWeek: {
    heading: 'Your first week',
    subhead: 'What happens after you click join.',
    steps: [
      {
        index: '01',
        title: 'Say who you are',
        body: 'Two sentences on your role and your stack. A filled-in bio earns a one-time points bonus.',
      },
      {
        index: '02',
        title: 'Bring one broken workflow',
        body: "Post it in fix-this-workflow. You'll have a substantive reply inside 24 hours.",
      },
      {
        index: '03',
        title: 'Ship it and write it up',
        body: 'Publish what you built, numbers included. That post is how the next operator finds us.',
      },
    ],
  },

  closing: {
    heading: 'Post your stack. Get it torn apart, kindly.',
    subhead:
      'Free, no invite needed. Introduce yourself in the watercooler and someone will answer inside a day.',
    cta: 'Create your account',
  },

  footer: {
    legal: '© 2026 PromptMetrics · Operator Stack',
    guidelines: 'Posting guidelines',
    feed: 'Feed',
    leaderboards: 'Leaderboards',
  },
} as const;

// Curated proof rows, in display order. Any slug that stops resolving (deleted,
// unpublished, moved) is replaced by the most recent public post, so the
// section fills itself as the community grows (see lib/services/landing.ts).
export const PROOF_POST_SLUGS = [
  'agent-powered-hubspot-cleanup-with-a-human-approval-gate-on-',
  'the-outcome-measured-mandates-that-actually-worked',
] as const;

export const PROOF_ROW_COUNT = 3;
