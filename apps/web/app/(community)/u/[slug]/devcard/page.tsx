import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Globe } from 'lucide-react';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getUserProfile, listUserCircleContributions, getUserStreakWeek } from '@/lib/services/users';
import { getUserBadges } from '@/lib/services/badges';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { StreakGrid } from '@pm-operator/ui/components/StreakGrid';
import { DevCardActions } from './DevCardActions';

// T8.7 DevCard (UX spec §3.7): a shareable operator summary — level, streak,
// badges, top circle contributions. Bounded waves mirror the profile page:
// getUserProfile (internally bounded) → a 2-wide wave → getUserBadges run as a
// trailing call because it fans out its own concurrent queries.
//
// T5G (decision D-B): this route is PUBLIC — middleware.ts allowlists exactly
// `/u/{slug}/devcard` and `/api/og/devcard/{slug}`, and nothing else under /u/.
// Everything rendered here is already public-profile data.

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://promptmetrics.dev').replace(/\/$/, '');
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = createServiceDb();
  const user = await getUserProfile(db, slug);

  if (!user) return { title: 'DevCard not found' };

  const name = user.fullName || user.username;
  const title = `${name}'s DevCard`;
  const description = `Level ${user.levelInfo.level} operator · ${user.postsCount} posts · ${user.acceptedSolutions} accepted solutions on Operator Stack.`;
  const base = siteUrl();
  const canonical = `${base}/u/${user.userslug}/devcard`;
  const image = `${base}/api/og/devcard/${user.userslug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function DevCardRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createServiceDb();

  const user = await getUserProfile(db, slug);
  if (!user) notFound();

  const [circles, streak] = await Promise.all([
    listUserCircleContributions(db, user.id, 5),
    getUserStreakWeek(db, user.id),
  ]);
  const badges = await getUserBadges(db, user.id);
  const earnedBadges = badges.earned.slice(0, 8);

  // Cookie decode only — no DB query, so the wave budget above is unchanged.
  const { session } = await getSession();
  const isOwner = session?.user?.id === user.id;

  const pngPath = `/api/og/devcard/${user.userslug}`;
  const shareUrl = `${siteUrl()}/u/${user.userslug}/devcard`;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4">
        <Link
          href={`/u/${user.userslug}`}
          className="text-sm text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)]"
        >
          ← Back to profile
        </Link>
      </div>

      {/* Page label, not the page heading — this route is public, so the h1
          belongs to the operator name on the card below, and the copy has to
          read for a stranger arriving from a shared link, not just the owner. */}
      <div className="mb-4 text-center">
        <p className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">
          {isOwner ? 'Your DevCard' : `${user.fullName || user.username}’s DevCard`}
        </p>
        <p className="mt-1 text-[13px] text-[var(--pm-muted)]">
          {isOwner
            ? 'A shareable snapshot of your operator reputation.'
            : 'A shareable snapshot of this operator’s reputation.'}
        </p>
      </div>

      <article className="overflow-hidden rounded-[var(--pm-radius-xl)] border border-[var(--pm-line)] bg-[var(--pm-paper-2)] shadow-[var(--pm-shadow)]">
        {/* Teal cover band — the anchor of the card, mirrored in the PNG. */}
        <div className="relative h-28 bg-[linear-gradient(135deg,var(--pm-teal)_0%,var(--pm-teal-dark)_100%)]">
          <span className="absolute right-5 top-5 rounded-[var(--pm-radius-pill)] border border-white/50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
            DevCard
          </span>
        </div>

        <div className="px-6 pb-6">
          {/* Avatar overlaps the band; the level rides as an ink corner badge
              (reference pattern) so nothing covers the name. The offset lives
              on a wrapper because Avatar applies className to its inner root,
              inside its own badge wrapper span. */}
          <div className="-mt-10">
            <Avatar
              src={user.pictureUrl ?? undefined}
              alt={user.username}
              fallback={user.fullName || user.username}
              size="xl"
              className="h-20 w-20 border-4 border-[var(--pm-paper-2)] text-xl"
              badge={
                <LevelBadge
                  level={user.levelInfo.level}
                  size="md"
                  className="border-[var(--pm-paper-2)]"
                />
              }
            />
          </div>
          <h1 className="mt-3 truncate font-serif text-xl font-semibold text-[var(--pm-ink)]">
            {user.fullName || user.username}
          </h1>
          <p className="mt-1 truncate text-sm text-[var(--pm-muted)]">
            @{user.userslug} · Joined {formatJoined(user.joinedAt)}
          </p>

          {/* Stat trio per the reference: Points / Solutions / Best streak.
              Level lives on the avatar badge above. */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Points" value={user.reputationScore.toLocaleString()} />
            <Stat label="Solutions" value={user.acceptedSolutions.toLocaleString()} />
            <Stat label="Best streak" value={streak ? `${streak.best}d` : '—'} />
          </div>

          {streak ? (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
                This week
              </h2>
              <StreakGrid days={streak.days} />
            </section>
          ) : null}

          {earnedBadges.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
                Badges ({badges.earned.length})
              </h2>
              <ul className="flex flex-wrap gap-2">
                {earnedBadges.map(({ badge, awardedAt }) => (
                  <li
                    key={badge.id}
                    title={`Earned ${formatJoined(awardedAt)}`}
                    className="inline-flex items-center gap-2 rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] py-1 pl-1 pr-3"
                  >
                    {badge.iconUrl ? (
                      <img
                        src={badge.iconUrl}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--pm-teal)_16%,transparent)] text-[11px] font-bold text-[var(--pm-teal-dark)]"
                      >
                        {badge.name.charAt(0)}
                      </span>
                    )}
                    <span className="text-[13px] font-medium text-[var(--pm-ink)]">
                      {badge.name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {circles.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
                Top circles
              </h2>
              <ul className="flex flex-col gap-2">
                {circles.map((c) => (
                  <li key={c.group.slug} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.group.color ?? 'var(--pm-muted-soft)' }}
                      aria-hidden="true"
                    />
                    <Link
                      href={`/g/${c.group.slug}`}
                      className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                    >
                      {c.group.name}
                    </Link>
                    <span className="text-xs text-[var(--pm-muted)]">
                      {c.score.toLocaleString()} pts · {c.acceptedSolutions} solved
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Reference footer strip: brand mark left, membership date right. */}
        <div className="flex items-center justify-between border-t border-[var(--pm-line)] bg-[var(--pm-paper)] px-6 py-3">
          <span className="flex items-baseline gap-1">
            <span className="font-serif text-[13px] font-semibold text-[var(--pm-ink)]">
              operator
            </span>
            <span className="text-[10px] font-semibold text-[var(--pm-coral)]">.promptmetrics</span>
          </span>
          <span className="font-mono text-[10.5px] text-[var(--pm-muted-soft)]">
            Since {formatJoined(user.joinedAt)}
          </span>
        </div>
      </article>

      {/* Below-card actions per the reference: Copy link outline, Download PNG
          raspberry filled. */}
      <DevCardActions shareUrl={shareUrl} pngPath={pngPath} userslug={user.userslug} />

      {isOwner ? (
        <p className="mt-4 flex items-start gap-2 rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3 text-[13px] text-[var(--pm-muted)]">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pm-teal-dark)]" aria-hidden="true" />
          <span>
            This DevCard is public, so anyone you send the link to can open it — no account
            needed. It shows the same stats as your{' '}
            <Link
              href={`/u/${user.userslug}`}
              className="font-medium text-[var(--pm-ink)] underline underline-offset-2"
            >
              public profile
            </Link>
            .
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-center">
      <div className="font-serif text-2xl font-semibold leading-tight text-[var(--pm-ink)]">
        {value}
      </div>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
        {label}
      </div>
    </div>
  );
}
