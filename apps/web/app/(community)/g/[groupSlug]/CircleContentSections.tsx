import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import type { CircleContent } from '@/lib/circle-content';

// Per-circle content sections (SEO plan Phase 2), pixel-matched to
// FixThisWorkflow.dc.html. Server components — the circle page injects them
// into FeedPage via checklistSlot / railSlot / emptySlot / listFooterSlot.
// Only circles with an entry in lib/circle-content.ts render these.

/** "How this circle works" 3-step card, top of the main column. */
export function CircleHowItWorks({ content }: { content: CircleContent['howItWorks'] }) {
  return (
    <div className="mb-6 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-[22px] py-5 shadow-[var(--pm-shadow)]">
      <p className="mb-3 font-serif text-[17px] font-semibold text-[var(--pm-ink)]">
        {content.title}
      </p>
      <div className="grid gap-5 sm:grid-cols-3">
        {content.steps.map((step) => (
          <div key={step.num}>
            <p className="mb-1.5 font-mono text-xs font-semibold text-[var(--pm-coral-dark)]">
              {step.num}
            </p>
            <p className="text-[13px] leading-[1.6] text-[var(--pm-ink-2)]">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "What makes a good teardown" checklist, first card of the right rail. */
export function CircleChecklistCard({ content }: { content: CircleContent['checklist'] }) {
  return (
    <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]">
      <p className="mb-2.5 font-serif text-base font-semibold text-[var(--pm-ink)]">
        {content.title}
      </p>
      <div className="flex flex-col gap-[9px] text-[13px] leading-[1.55] text-[var(--pm-ink-2)]">
        {content.items.map((item) => (
          <div key={item.text} className="flex gap-[9px]">
            <span
              aria-hidden="true"
              className={`font-bold ${item.ok ? 'text-[var(--pm-green)]' : 'text-[var(--pm-muted-soft)]'}`}
            >
              {item.ok ? '✓' : '✕'}
            </span>
            {item.text}
          </div>
        ))}
      </div>
      <Link
        href="/guidelines"
        className="mt-3 inline-block text-[13px] font-semibold text-[var(--pm-coral-dark)]"
      >
        {content.guidelinesLabel}
      </Link>
    </div>
  );
}

/** Circle-specific empty state (replaces the feed's default empty card). */
export function CircleEmptyState({
  content,
  composeHref,
}: {
  content: CircleContent['emptyState'];
  composeHref: string;
}) {
  return (
    <div className="mt-8 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-10 py-14 text-center shadow-[var(--pm-shadow)]">
      <div
        aria-hidden="true"
        className="mx-auto mb-[18px] flex h-11 w-11 items-center justify-center rounded-[var(--pm-radius-md)] border border-dashed border-[var(--pm-line-2)] font-mono text-[17px] text-[var(--pm-muted-soft)]"
      >
        fx
      </div>
      <p className="mb-2.5 font-serif text-2xl font-semibold text-[var(--pm-ink)]">
        {content.title}
      </p>
      <p className="mx-auto mb-6 max-w-[460px] text-[15px] leading-[1.65] text-[var(--pm-ink-2)]">
        {content.body}
      </p>
      <div className="flex items-center justify-center gap-4">
        <Button asChild>
          <Link href={composeHref}>{content.ctaLabel}</Link>
        </Button>
        <Link
          href="/guidelines"
          className="text-sm font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
        >
          {content.guidelinesLabel}
        </Link>
      </div>
    </div>
  );
}

/** Seeded-state footer strip below the post list. */
export function CircleListFooter({ text, composeHref }: { text: string; composeHref: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-5 py-[18px]">
      <span className="text-[13px] text-[var(--pm-ink-2)]">{text}</span>
      <div className="flex-1" />
      <Button variant="secondary" size="sm" asChild>
        <Link href={composeHref}>Post a broken workflow</Link>
      </Button>
    </div>
  );
}
