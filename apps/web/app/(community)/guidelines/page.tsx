import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { getPublicSiteUrl } from '@/lib/site-url';
import { metaDescription } from '@/lib/seo/meta-description';
import { GUIDELINES_COPY } from './guidelines-copy';

// /guidelines (SEO plan Phase 4). Pixel target:
// update/mint/promptmetrics-community-portal-redesign/project/Guidelines.dc.html;
// every string lives in guidelines-copy.ts with handover fixes G1–G6 applied.
//
// Fully static: no session, no DB, no createServiceDb — safe to prerender and
// it stays that way (pool = 3 trap; the community layout already spends its
// own query budget on the rail).

const COPY = GUIDELINES_COPY;
const CANONICAL = `${getPublicSiteUrl()}/guidelines`;
const DESCRIPTION = metaDescription(COPY.intro);

export const metadata: Metadata = {
  title: COPY.meta.title,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: COPY.meta.title,
    description: DESCRIPTION,
    url: CANONICAL,
    type: 'website',
  },
  twitter: { card: 'summary', title: COPY.meta.title, description: DESCRIPTION },
};

const artifactLabel =
  'mb-2 text-[11px] font-bold uppercase tracking-[0.08em]';

function RuleArtifact({ artifact }: { artifact: (typeof COPY.rules)[number]['artifact'] }) {
  switch (artifact.kind) {
    case 'examples':
      return (
        <div className="grid max-w-[760px] gap-3.5 sm:grid-cols-2">
          <div className="rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] border-l-[3px] border-l-[var(--pm-danger)] bg-[var(--pm-paper-2)] px-[18px] py-4">
            <div className={`${artifactLabel} text-[var(--pm-danger)]`}>{artifact.dontLabel}</div>
            <p className="text-sm leading-[1.6] italic text-[var(--pm-ink-2)]">{artifact.dont}</p>
          </div>
          <div className="rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] border-l-[3px] border-l-[var(--pm-green)] bg-[var(--pm-paper-2)] px-[18px] py-4">
            <div className={`${artifactLabel} text-[var(--pm-green)]`}>{artifact.doLabel}</div>
            <p className="text-sm leading-[1.6] italic text-[var(--pm-ink-2)]">{artifact.do}</p>
          </div>
        </div>
      );
    case 'headings':
      return (
        <div className="grid max-w-[760px] gap-5 rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-5 py-[18px] sm:grid-cols-2">
          <div>
            <div className={`${artifactLabel} mb-2.5 text-[var(--pm-muted)]`}>
              {artifact.insteadOfLabel}
            </div>
            <div className="flex flex-col gap-[7px] font-mono text-[13px] text-[var(--pm-muted)]">
              {artifact.insteadOf.map((heading) => (
                <span key={heading}>{heading}</span>
              ))}
            </div>
          </div>
          <div>
            <div className={`${artifactLabel} mb-2.5 text-[var(--pm-cat-education)]`}>
              {artifact.writeLabel}
            </div>
            <div className="flex flex-col gap-[7px] font-mono text-[13px] text-[var(--pm-ink-2)]">
              {artifact.write.map((heading) => (
                <span key={heading}>{heading}</span>
              ))}
            </div>
          </div>
        </div>
      );
    case 'chips':
      return (
        <div className="flex max-w-[760px] flex-wrap gap-2.5">
          {artifact.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-[var(--pm-radius-sm)] bg-[var(--pm-paper-3)] px-3 py-1.5 font-mono text-[13px] font-semibold text-[var(--pm-ink-2)]"
            >
              {chip}
            </span>
          ))}
        </div>
      );
    case 'citation':
      return (
        <div className="max-w-[760px] rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-5 py-[18px]">
          <p className="text-sm leading-[1.7] italic text-[var(--pm-ink-2)]">
            {artifact.before}
            <span className="not-italic text-[var(--pm-coral-dark)]">{artifact.source}</span>
            {artifact.after}
          </p>
        </div>
      );
    case 'closer':
      return (
        <div className="max-w-[760px] rounded-[var(--pm-radius-sm)] bg-[var(--pm-coral-tint)] px-5 py-[18px]">
          <p className="text-[15px] leading-[1.7] text-[var(--pm-ink)]">
            <strong>{artifact.label}</strong>
            {artifact.text}
          </p>
        </div>
      );
  }
}

export default function GuidelinesPage() {
  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-6 mt-8">
        <div className="mb-[18px] font-mono text-xs font-medium uppercase tracking-[0.12em] text-[var(--pm-cat-education)]">
          {COPY.eyebrow}
        </div>
        <h1 className="mb-[18px] max-w-[760px] font-serif text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--pm-ink)] md:text-[46px]">
          {COPY.h1}
        </h1>
        <p className="max-w-[720px] text-base leading-[1.65] text-[var(--pm-ink-2)] md:text-lg">
          {COPY.intro}
        </p>
      </div>

      <div className="grid items-start gap-14 pb-14 lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-[18px] lg:sticky lg:top-24">
          <nav
            aria-label={COPY.tocTitle}
            className="flex flex-col gap-3 border-l-2 border-[var(--pm-line-2)] pl-[18px]"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
              {COPY.tocTitle}
            </div>
            {COPY.toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-[13px] leading-[1.45] text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
            <div className="mb-3 text-[13px] leading-[1.6] text-[var(--pm-ink-2)]">
              {COPY.newPostCard.prompt}
            </div>
            <Button size="sm" asChild>
              <Link href="/post/new">{COPY.newPostCard.cta}</Link>
            </Button>
          </div>
        </aside>

        <div className="flex flex-col gap-[52px]">
          {COPY.rules.map((rule) => (
            <section key={rule.id} id={rule.id} className="scroll-mt-24">
              <div className="mb-3.5 flex items-baseline gap-3.5">
                <span className="font-mono text-[13px] font-semibold text-[var(--pm-coral-dark)]">
                  {rule.num}
                </span>
                <h2 className="font-serif text-[24px] font-semibold leading-[1.2] text-[var(--pm-ink)] md:text-[30px]">
                  {rule.heading}
                </h2>
              </div>
              <div className="mb-5 flex max-w-[700px] flex-col gap-3.5">
                {rule.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-base leading-[1.7] text-[var(--pm-ink-2)]">
                    {paragraph}
                  </p>
                ))}
              </div>
              <RuleArtifact artifact={rule.artifact} />
            </section>
          ))}

          <div className="flex flex-wrap items-center gap-[18px] border-t border-[var(--pm-line)] pt-7">
            <Button asChild>
              <Link href="/post/new">{COPY.footer.cta}</Link>
            </Button>
            <Link
              href="/feed"
              className="text-sm font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
            >
              {COPY.footer.proofLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
