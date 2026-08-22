/**
 * Per-circle content sections (SEO content plan Phase 2), keyed by group slug.
 * Strings are verbatim from FixThisWorkflow.dc.html with handover W1–W3
 * applied (colons/periods, no em dashes). Circles without an entry render the
 * plain post list — add an entry here to give another circle the same
 * sections, no code changes needed.
 */

export interface CircleContentStep {
  /** Mono step number, e.g. '01'. */
  num: string;
  body: string;
}

export interface CircleContentChecklistItem {
  /** true renders a green ✓, false a muted ✕. */
  ok: boolean;
  text: string;
}

export interface CircleContent {
  /** "How this circle works" 3-step card above the post list. */
  howItWorks: {
    title: string;
    steps: CircleContentStep[];
  };
  /** Sidebar checklist card, first card in the right rail. */
  checklist: {
    title: string;
    items: CircleContentChecklistItem[];
    /** "Read the guidelines →" */
    guidelinesLabel: string;
  };
  /** Replaces the default feed empty card when the circle has no posts. */
  emptyState: {
    title: string;
    body: string;
    ctaLabel: string;
    /** "How to write it →" */
    guidelinesLabel: string;
  };
  /** Footer strip rendered below the post list while posts exist. */
  seededFooter: string;
}

export const CIRCLE_CONTENT: Record<string, CircleContent> = {
  'fix-this-workflow': {
    howItWorks: {
      title: 'How this circle works',
      steps: [
        {
          num: '01',
          body: 'Post the workflow as it exists today: steps, tools, and what goes wrong. Numbers if you have them.',
        },
        {
          num: '02',
          body: 'Operators reply with fixes. Every reply adds a number, a source, or a counter-example.',
        },
        {
          num: '03',
          body: 'Mark the one that worked as the solution. The replier earns +25 pts and the thread stays findable.',
        },
      ],
    },
    checklist: {
      title: 'What makes a good teardown',
      items: [
        { ok: true, text: "The workflow's actual steps, in order" },
        { ok: true, text: 'What it costs when it breaks, with a number' },
        { ok: true, text: "What you've already ruled out" },
        { ok: false, text: '"It\'s just slow" with no measurement' },
      ],
      guidelinesLabel: 'Read the guidelines →',
    },
    emptyState: {
      title: 'Nothing broken here yet',
      body: "Be the first. Post the workflow that's been annoying you since March: the steps, the tools, and what it costs you when it fails. You'll have a substantive reply inside 24 hours.",
      ctaLabel: 'Post the first one',
      guidelinesLabel: 'How to write it →',
    },
    seededFooter: 'Two teardowns so far. Yours makes three.',
  },
};

export function getCircleContent(slug: string): CircleContent | undefined {
  return CIRCLE_CONTENT[slug];
}
