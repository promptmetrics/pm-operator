// Guidelines page copy — every user-visible string on `/guidelines` lives here.
//
// Source of truth: update/mint/promptmetrics-community-portal-redesign/project/
// Guidelines.dc.html (pixel target) with the copy-handover replacements G1–G6
// applied (update/mint/promptmetrics-community-portal-redesign/project/uploads/
// COPY-HANDOVER-2026-08-21.md). All six were already applied in the mockup
// source; verified string-by-string 2026-08-22.
//
// Known deviation from the "no em dashes" brand rule: rule 02's second
// paragraph keeps its em dash ("…140–170 words — one question…") because the
// handover explicitly marks rule 02 "verified, no change" and prescribes only
// G1–G6. Strings otherwise ship character-for-character; never introduce new
// em dashes — brand copy uses colons and periods.

export const GUIDELINES_COPY = {
  meta: {
    // Title-tag separator em dash is the documented exception (same template
    // as the circle pages: "<name> — Operator Stack community").
    title: 'Posting guidelines — Operator Stack community',
  },

  eyebrow: 'Posting guidelines',
  h1: "How do you write a post that's still useful in a year?",
  // G1 applied: "rules. That's the test." (was an em dash).
  intro:
    "Five rules. They exist because operators arrive here mid-problem, usually from a search result, and they need the answer before they need the story. Follow them and your post gets read, replied to, and found again months later. This page follows its own rules. That's the test.",

  tocTitle: 'On this page',
  toc: [
    { id: 'rule-1', label: '01 · Answer in the first 60 words' },
    { id: 'rule-2', label: '02 · Head sections with real questions' },
    { id: 'rule-3', label: '03 · Numbers, not adjectives' },
    { id: 'rule-4', label: '04 · One primary source per claim' },
    { id: 'rule-5', label: '05 · Name what broke' },
  ],

  newPostCard: {
    prompt: 'Ready to write one?',
    cta: 'New post',
  },

  rules: [
    {
      id: 'rule-1',
      num: '01',
      heading: 'Can someone get the answer without scrolling?',
      paragraphs: [
        // G2 applied: "a lot". The answer." (was an em dash).
        'Open with 40–60 words that answer the question in your title. Not context, not "we\'ve been thinking about this a lot". The answer. If someone reads only your first paragraph they should be able to act, and if they keep reading it\'s because they want the how, not because you withheld the what.',
        'This is also what search engines and answer engines quote. A buried conclusion gets summarised badly or not at all. Put the finding up top, then earn the rest of the scroll.',
      ],
      artifact: {
        kind: 'examples',
        // Deliberately bad copy — the handover says do not fix it.
        dontLabel: "Don't",
        dont: '"So we\'ve been running HubSpot since 2023 and honestly the data has always been a bit of a mess. Last quarter our VP asked me to look into it…"',
        doLabel: 'Do',
        // G3 applied: "similarity. That one rule" (was an em dash).
        do: '"We deduped 41,000 HubSpot contacts in a 40-minute supervised agent run. Match on normalised email domain plus company, never on name similarity. That one rule removed 94% of false positives."',
      },
    },
    {
      id: 'rule-2',
      num: '02',
      heading: 'Are your headings the questions people actually type?',
      paragraphs: [
        'Write every section heading as the question that section answers, in the words an operator would use. "Setup" tells nobody anything. "What permissions does the MCP server actually need?" tells a reader whether to stop scrolling, and it matches how people search.',
        // Em dash retained: handover marks rule 02 in full "verified, no change".
        'Keep each section to roughly 140–170 words — one question, one answer, then move on. If a section runs past that, it\'s usually two questions wearing one heading. Split it.',
      ],
      artifact: {
        kind: 'headings',
        insteadOfLabel: 'Instead of',
        insteadOf: ['## Setup', '## Results', '## Lessons learned'],
        writeLabel: 'Write',
        write: [
          '## What does the agent need access to?',
          '## How long did the run actually take?',
          '## What would I not do again?',
        ],
      },
    },
    {
      id: 'rule-3',
      num: '03',
      heading: 'Where are the numbers?',
      paragraphs: [
        '"Much faster" is not a result. Give the before, the after, and the unit: records touched, minutes saved per week, error rate, seats affected, dollars if you can share them. A number is what makes your post worth more than the same claim on a vendor blog.',
        // G4 applied: "is fine. Say so." (was an em dash).
        'You don\'t need clean numbers. Approximate is fine, ranges are fine, "we stopped measuring after week three" is fine. Say so. What isn\'t fine is an adjective standing in for a measurement you never took.',
      ],
      artifact: {
        kind: 'chips',
        chips: [
          '6 wks → 40 min',
          '41,000 records',
          '80% → 40% adoption',
          '1,900 double-assigned leads',
          '~4h/week returned',
        ],
      },
    },
    {
      id: 'rule-4',
      num: '04',
      heading: 'Can a reader check your claim themselves?',
      paragraphs: [
        // G5 applied: "primary source: the vendor's" (was an em dash).
        'Every factual claim that isn\'t your own experience gets a link to the primary source: the vendor\'s API docs, the changelog entry, the rate-limit page. Not a listicle, not a screenshot of a listicle. If the only source is your own run, say "in our instance" and let the reader weigh it.',
        // G6 applied: parenthesised "as of August 2026" (was em-dash pair).
        'Limits and pricing change constantly. Dating the claim ("as of August 2026") costs you six words and saves the next reader an hour of confusion.',
      ],
      artifact: {
        kind: 'citation',
        before: '"HubSpot\'s batch upsert caps at 100 objects per request (',
        source: 'developers.hubspot.com, checked 14 Aug 2026',
        after: '), so the agent chunks the merge list before it calls anything."',
      },
    },
    {
      id: 'rule-5',
      num: '05',
      heading: 'What broke, and what did it cost you?',
      paragraphs: [
        'Every real build has a failure in it. Name yours: the run you had to roll back, the field you overwrote, the week adoption collapsed. That paragraph is the most valuable thing in your post, because it\'s the part nobody else publishes.',
        'It also sets the tone here. Replies tear the workflow apart, never the person. If you\'re on the replying side: add a number, a source, or a counter-example, or don\'t post the reply.',
      ],
      artifact: {
        kind: 'closer',
        label: 'The one-line version:',
        text: ' answer first, question headings, real numbers, checkable sources, and the failure included. Everything else is style.',
      },
    },
  ],

  footer: {
    cta: 'Write a post',
    // No static circle+post slug pair exists for the curated proof posts
    // (landing-copy PROOF_POST_SLUGS carries post slugs only, resolved to
    // circles via DB at runtime), so this links to /feed rather than a
    // hardcoded post URL.
    proofLabel: 'See a post that follows all five →',
  },
} as const;
