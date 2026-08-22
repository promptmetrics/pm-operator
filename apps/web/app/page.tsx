import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicSiteUrl } from '@/lib/site-url';
import { buildWebSiteJsonLd } from '@/lib/seo/site-jsonld';
import { serializeJsonLd } from '@/lib/seo/post-jsonld';
import { getLandingData, type LandingProofPost } from '@/lib/services/landing';
import { LANDING_COPY } from './landing-copy';
import { LandingCta } from './components/LandingCta';

// The landing page replaced the `/` → /feed 308 (the temporary redirect had
// GSC filing /feed as "Duplicate without user-selected canonical" — a real
// entry page can be indexed instead). Pixel target:
// update/mint/promptmetrics-community-portal-redesign/project/Landing.dc.html;
// every string lives in landing-copy.ts.
//
// Rendering stays dynamic (root layout force-dynamic) while all DB data rides
// a 24h unstable_cache entry (lib/services/landing.ts), so a warm request
// runs zero queries and a cold one runs at most three, sequentially.

const CANONICAL = getPublicSiteUrl();
const COPY = LANDING_COPY;

export const metadata: Metadata = {
  title: COPY.meta.title,
  description: COPY.meta.description,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: COPY.meta.title,
    description: COPY.meta.description,
    url: CANONICAL,
    type: 'website',
  },
  twitter: { card: 'summary', title: COPY.meta.title, description: COPY.meta.description },
};

const wrap = 'mx-auto max-w-[1080px] px-10';

const mutedLink = 'text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]';

function ProofRow({
  post,
  index,
  last,
}: {
  post: LandingProofPost;
  index: number;
  last: boolean;
}) {
  return (
    <Link
      href={`/g/${post.groupSlug}/${post.slug}`}
      className={`grid grid-cols-[96px_minmax(0,1fr)_180px] items-start gap-8 border-t border-[var(--pm-line)] px-1 py-7 text-inherit hover:bg-[var(--pm-paper-2)] ${
        last ? 'border-b' : ''
      }`}
    >
      <div className="pt-[5px] font-mono text-xs text-[var(--pm-muted-soft)]">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div>
        <div className="mb-2.5 font-serif text-2xl font-semibold leading-[1.3] text-[var(--pm-ink)]">
          {post.title}
        </div>
        <p className="m-0 text-[15px] leading-[1.6] text-[var(--pm-ink-2)]">{post.excerpt}</p>
      </div>
      <div className="pt-[5px] text-right">
        <div className="text-[13px] font-semibold text-[var(--pm-ink-2)]">{post.authorName}</div>
        <div className="mt-1 text-xs text-[var(--pm-muted)]">{post.groupSlug}</div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const data = await getLandingData();
  const format = (n: number) => n.toLocaleString('en-US');

  return (
    <div
      // The landing owns its chrome: the community layout's header/rail only
      // applies inside (community), and the root layout carries no global nav.
      className="min-h-screen bg-[var(--pm-paper)] font-sans text-[var(--pm-ink)]"
    >
      {/* WebSite node for the subdomain, publisher-linked to www's Organization
          @id so the two graphs merge. Moved here from /feed now that `/` is a
          real page and the site's front door (was the 308's target). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd(getPublicSiteUrl())),
        }}
      />

      <header className="border-b border-[var(--pm-line)] bg-[var(--pm-paper)]">
        <div className={`${wrap} flex h-[68px] items-center gap-6`}>
          <Link
            href="/"
            className="flex items-center gap-[9px] font-serif text-xl font-semibold text-[var(--pm-ink)]"
          >
            <span className="inline-block size-2.5 rounded-full bg-[var(--pm-coral)]" />
            Operator Stack
          </Link>
          <div className="flex-1" />
          <Link href="/feed" className={mutedLink}>
            {COPY.header.feed}
          </Link>
          <Link href="/guidelines" className={mutedLink}>
            {COPY.header.guidelines}
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
          >
            {COPY.header.login}
          </Link>
          <LandingCta label={COPY.header.join} placement="header" size="sm" />
        </div>
      </header>

      {/* Hero */}
      <div
        className={`${wrap} grid grid-cols-[minmax(0,1fr)_300px] items-end gap-[72px] pb-[72px] pt-[84px]`}
      >
        <div>
          <div className="mb-[22px] font-mono text-xs font-medium uppercase tracking-[0.12em] text-[var(--pm-cat-education)]">
            {COPY.hero.badge}
          </div>
          <h1 className="m-0 mb-[26px] font-serif text-[62px] font-semibold leading-[1.04] tracking-[-0.02em] text-[var(--pm-ink)] [text-wrap:balance]">
            {COPY.hero.headingLine1}
            <br />
            {COPY.hero.headingLine2Pre}
            <em className="italic text-[var(--pm-coral-dark)]">{COPY.hero.headingEmphasis}</em>.
          </h1>
          <p className="m-0 mb-[34px] max-w-[640px] text-[19px] leading-[1.6] text-[var(--pm-ink-2)] [text-wrap:pretty]">
            {COPY.hero.subhead}
          </p>
          <div className="flex items-center gap-[18px]">
            <LandingCta label={COPY.hero.primaryCta} placement="hero" size="lg" />
            <Link
              href="/feed"
              className="border-b border-[var(--pm-line-2)] pb-0.5 text-[15px] font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
            >
              {COPY.hero.secondaryCta}
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-[26px] border-l border-[var(--pm-line)] pl-7">
          <div>
            <div className="font-serif text-[38px] font-semibold leading-none text-[var(--pm-ink)]">
              {format(data.memberCount)}
            </div>
            <div className="mt-1.5 text-[13px] text-[var(--pm-muted)]">
              {COPY.hero.operatorLabel}
            </div>
          </div>
          <div>
            <div className="font-serif text-[38px] font-semibold leading-none text-[var(--pm-ink)]">
              {format(data.postCount)}
            </div>
            <div className="mt-1.5 text-[13px] text-[var(--pm-muted)]">{COPY.hero.postLabel}</div>
          </div>
          <div className="text-xs leading-[1.5] text-[var(--pm-muted)]">{COPY.hero.statsFootnote}</div>
        </div>
      </div>

      {/* Personas */}
      <div className="border-t border-[var(--pm-line)] bg-[var(--pm-paper-2)]">
        <div className={`${wrap} py-[68px]`}>
          <h2 className="m-0 mb-2 font-serif text-[32px] font-semibold text-[var(--pm-ink)]">
            {COPY.personas.heading}
          </h2>
          <p className="m-0 mb-10 max-w-[620px] text-base text-[var(--pm-ink-2)]">
            {COPY.personas.subhead}
          </p>
          <div className="grid grid-cols-4 gap-px border border-[var(--pm-line)] bg-[var(--pm-line)]">
            {COPY.personas.cards.map((card) => (
              <div key={card.title} className="bg-[var(--pm-paper)] px-[22px] pb-7 pt-[26px]">
                <div className="mb-2.5 font-serif text-[19px] font-semibold text-[var(--pm-ink)]">
                  {card.title}
                </div>
                <p className="m-0 text-sm leading-[1.65] text-[var(--pm-ink-2)]">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proof */}
      <div className={`${wrap} pb-[68px] pt-[76px]`}>
        <div className="mb-[38px] flex items-baseline justify-between">
          <h2 className="m-0 font-serif text-[32px] font-semibold text-[var(--pm-ink)]">
            {COPY.proof.heading}
          </h2>
          <Link href="/feed" className="text-sm font-semibold text-[var(--pm-coral-dark)]">
            {COPY.proof.allPostsPrefix}
            {format(data.postCount)}
            {COPY.proof.allPostsSuffix}
          </Link>
        </div>
        <div className="flex flex-col">
          {data.proofPosts.map((post, index) => (
            <ProofRow
              key={post.slug}
              post={post}
              index={index}
              last={index === data.proofPosts.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Circles */}
      <div className="border-t border-[var(--pm-line)] bg-[var(--pm-paper-inset)]">
        <div className={`${wrap} py-[60px]`}>
          <h2 className="m-0 mb-2 font-serif text-[26px] font-semibold text-[var(--pm-ink)]">
            {COPY.circles.heading}
          </h2>
          <p className="m-0 mb-[26px] text-[15px] text-[var(--pm-ink-2)]">{COPY.circles.subhead}</p>
          <div className="grid grid-cols-3 gap-3.5">
            {COPY.circles.items.map((circle) => (
              <Link
                key={circle.slug}
                href={`/g/${circle.slug}`}
                className="rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] bg-[var(--pm-paper)] p-5 text-inherit hover:border-[var(--pm-coral)]"
              >
                <div className="mb-2 font-mono text-[13px] font-semibold text-[var(--pm-cat-education)]">
                  {circle.slug}
                </div>
                <p className="m-0 text-[13px] leading-[1.6] text-[var(--pm-ink-2)]">
                  {circle.blurb}
                </p>
              </Link>
            ))}
            <div className="flex items-center rounded-[var(--pm-radius-sm)] border border-dashed border-[var(--pm-line-2)] p-5">
              <Link href="/g" className="text-[13px] font-semibold text-[var(--pm-coral-dark)]">
                {COPY.circles.browseAll}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Your first week */}
      <div className="border-t border-[var(--pm-line)]">
        <div className={`${wrap} py-16`}>
          <h2 className="m-0 mb-2 font-serif text-[26px] font-semibold text-[var(--pm-ink)]">
            {COPY.firstWeek.heading}
          </h2>
          <p className="m-0 mb-7 text-[15px] text-[var(--pm-ink-2)]">{COPY.firstWeek.subhead}</p>
          <div className="grid grid-cols-3 gap-px border border-[var(--pm-line)] bg-[var(--pm-line)]">
            {COPY.firstWeek.steps.map((step) => (
              <div key={step.index} className="bg-[var(--pm-paper)] px-6 py-[26px]">
                <div className="mb-3 font-mono text-xs font-semibold text-[var(--pm-coral-dark)]">
                  {step.index}
                </div>
                <div className="mb-2 font-serif text-lg font-semibold text-[var(--pm-ink)]">
                  {step.title}
                </div>
                <p className="m-0 text-sm leading-[1.6] text-[var(--pm-ink-2)]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Closing CTA */}
      <div className="border-t border-[var(--pm-line)] bg-[var(--pm-paper-2)]">
        <div className={`${wrap} py-20 text-center`}>
          <h2 className="m-0 mb-4 font-serif text-[40px] font-semibold tracking-[-0.01em] text-[var(--pm-ink)]">
            {COPY.closing.heading}
          </h2>
          <p className="m-0 mx-auto mb-[30px] max-w-[560px] text-[17px] leading-[1.6] text-[var(--pm-ink-2)]">
            {COPY.closing.subhead}
          </p>
          <LandingCta label={COPY.closing.cta} placement="closing" size="lg" />
        </div>
      </div>

      <footer className="border-t border-[var(--pm-line)]">
        <div
          className={`${wrap} flex items-center gap-6 py-7 text-[13px] text-[var(--pm-muted)]`}
        >
          <span>{COPY.footer.legal}</span>
          <div className="flex-1" />
          <Link href="/guidelines" className="text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]">
            {COPY.footer.guidelines}
          </Link>
          <Link href="/feed" className="text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]">
            {COPY.footer.feed}
          </Link>
          <Link href="/leaderboards" className="text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]">
            {COPY.footer.leaderboards}
          </Link>
        </div>
      </footer>
    </div>
  );
}
