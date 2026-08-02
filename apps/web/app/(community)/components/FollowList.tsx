import Link from 'next/link';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import type { FollowListItem } from '@pm-operator/api';

interface FollowListProps {
  items: FollowListItem[];
  emptyMessage: string;
}

// Presentational list of users for the followers/following pages. Edge lists
// are self-only (decision 2A): the page enforces viewer === subject before
// rendering, so this component never receives another user's private list.
export function FollowList({ items, emptyMessage }: FollowListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 text-center">
        <p className="text-[var(--pm-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul
      role="list"
      className="divide-y divide-[var(--pm-line)] overflow-hidden rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)]"
    >
      {items.map((u) => (
        <li key={u.id} className="px-4 py-3">
          <Link
            href={`/u/${u.userslug}`}
            className="flex min-w-0 items-center gap-3 hover:text-[var(--pm-coral-dark)]"
          >
            <Avatar
              src={u.pictureUrl ?? undefined}
              alt={u.username}
              fallback={(u.fullName || u.username).slice(0, 2).toUpperCase()}
              size="sm"
              badge={<LevelBadge level={u.level} size="xs" />}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium text-[var(--pm-ink)]">
                {u.fullName || u.username}
              </span>
              <span className="block truncate text-xs text-[var(--pm-muted)]">
                /u/{u.userslug} · {u.acceptedSolutions} solutions ·{' '}
                {u.reputationScore.toLocaleString()} pts
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}