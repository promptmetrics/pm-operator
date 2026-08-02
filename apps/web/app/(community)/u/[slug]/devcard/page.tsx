import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getUserProfile, listUserCircleContributions, getUserStreakWeek } from '@/lib/services/users';
import { getUserBadges } from '@/lib/services/badges';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { StreakGrid } from '@pm-operator/ui/components/StreakGrid';

// T8.7 DevCard (UX spec §3.7): a shareable operator summary — level, streak,
// badges, top circle contributions. Bounded waves mirror the profile page:
// getUserProfile (internally bounded) → a 2-wide wave → getUserBadges run as a
// trailing call because it fans out its own concurrent queries.

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--pm-muted)]">
          <Link href={`/u/${user.userslug}`} className="hover:text-[var(--pm-ink)]">
            ← Back to profile
          </Link>
        </p>
        <span className="rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
          DevCard
        </span>
      </div>

      <div className="rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-6 shadow-[var(--pm-shadow)]">
        <div className="mb-6 flex items-center gap-4">
          <Avatar
            src={user.pictureUrl ?? undefined}
            alt={user.username}
            fallback={user.fullName || user.username}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-serif text-2xl font-semibold text-[var(--pm-ink)]">
                {user.fullName || user.username}
              </h1>
              <LevelBadge level={user.levelInfo.level} size="md" />
            </div>
            <p className="text-sm text-[var(--pm-muted)]">
              @{user.userslug} · Joined {formatJoined(user.joinedAt)}
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Level" value={String(user.levelInfo.level)} />
          <Stat label="Posts" value={user.postsCount.toLocaleString()} />
          <Stat label="Solutions" value={user.acceptedSolutions.toLocaleString()} />
          <Stat
            label="Streak"
            value={streak ? `${streak.current}d` : '—'}
            hint={streak ? `best ${streak.best}d` : undefined}
          />
        </div>

        {streak ? (
          <div className="mb-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
              This week
            </p>
            <StreakGrid days={streak.days} />
          </div>
        ) : null}

        {earnedBadges.length > 0 ? (
          <div className="mb-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
              Badges ({badges.earned.length})
            </p>
            <ul className="flex flex-wrap gap-3">
              {earnedBadges.map(({ badge, awardedAt }) => (
                <li key={badge.id} className="flex items-center gap-2">
                  {badge.iconUrl ? (
                    <img
                      src={badge.iconUrl}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pm-coral-tint)] text-xs font-bold text-[var(--pm-coral-dark)]">
                      {badge.name.charAt(0)}
                    </span>
                  )}
                  <div className="leading-tight">
                    <p className="text-[13px] font-semibold text-[var(--pm-ink)]">{badge.name}</p>
                    <p className="text-[11px] text-[var(--pm-muted)]">
                      {formatJoined(awardedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {circles.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
              Top circles
            </p>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-center">
      <div className="font-serif text-xl font-semibold text-[var(--pm-ink)]">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
        {label}
      </div>
      {hint ? <div className="text-[10px] text-[var(--pm-muted)]">{hint}</div> : null}
    </div>
  );
}