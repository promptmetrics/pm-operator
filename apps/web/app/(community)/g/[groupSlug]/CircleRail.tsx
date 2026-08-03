import Link from 'next/link';
import type {
  Group,
  GroupMember,
  GroupWithPostCount,
  LeaderboardEntry,
} from '@pm-operator/api';
import { Avatar } from '@pm-operator/ui/components/Avatar';

const railCardClass =
  'rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]';

const cardTitleClass = 'mb-3 font-serif text-base font-semibold text-[var(--pm-ink)]';

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Circle-page right rail (WS6/T6.2): About / Top contributors / Other circles,
// per Circle.dc.html. Server component — passed into FeedPage via railSlot.
export function CircleRail({
  group,
  moderators,
  leaderboard,
  otherCircles,
}: {
  group: Group;
  moderators: GroupMember[];
  leaderboard: LeaderboardEntry[];
  otherCircles: GroupWithPostCount[];
}) {
  return (
    <>
      <div className={railCardClass}>
        <p className={cardTitleClass}>About this circle</p>
        {group.description ? (
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--pm-ink-2)]">
            {group.description}
          </p>
        ) : null}
        <p className="text-xs text-[var(--pm-muted)]">
          Created {formatMonthYear(group.createdAt)}
          {moderators.length > 0 ? (
            <>
              {' · Moderated by '}
              {moderators.map((mod, index) => (
                <span key={mod.id}>
                  {index > 0 ? ', ' : null}
                  <Link
                    href={`/u/${mod.userslug}`}
                    className="font-semibold text-[var(--pm-coral-dark)] hover:underline"
                  >
                    {mod.username}
                  </Link>
                </span>
              ))}
            </>
          ) : null}
        </p>
      </div>

      {leaderboard.length > 0 ? (
        <div className={railCardClass}>
          <p className={cardTitleClass}>Top contributors</p>
          <ul className="flex flex-col gap-2.5">
            {leaderboard.map((entry) => (
              <li key={entry.userslug} className="flex items-center gap-2.5">
                <Avatar alt={entry.username} fallback={entry.username} size="xs" />
                <Link
                  href={`/u/${entry.userslug}`}
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                >
                  {entry.username}
                </Link>
                <span className="text-xs text-[var(--pm-muted)]">
                  {entry.acceptedSolutions === 1
                    ? '1 solution'
                    : `${entry.acceptedSolutions} solutions`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {otherCircles.length > 0 ? (
        <div className={railCardClass}>
          <p className={cardTitleClass}>Other circles</p>
          <nav className="flex flex-col gap-2">
            {otherCircles.map((circle) => (
              <Link
                key={circle.slug}
                href={`/g/${circle.slug}`}
                className="flex items-center gap-2 text-[13px] text-[var(--pm-ink-2)] hover:text-[var(--pm-ink)]"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: circle.color ?? 'var(--pm-muted-soft)' }}
                  aria-hidden="true"
                />
                <span className="truncate">{circle.name}</span>
                <span className="ml-auto text-xs text-[var(--pm-muted)]">{circle.postCount}</span>
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
