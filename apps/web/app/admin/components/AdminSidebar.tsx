'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

/**
 * Flat text nav per the moderation-admin reference: no icons, no group
 * headings, every admin destination in one list. Order follows the reference
 * (content first, system last); Approval/History sit under Moderation.
 */
const LINKS: { href: string; label: string }[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/groups', label: 'Circles' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/moderation/approval', label: 'Approval' },
  { href: '/admin/moderation/history', label: 'History' },
  { href: '/admin/watched-phrases', label: 'Watched phrases' },
  { href: '/admin/badges', label: 'Badges' },
  { href: '/admin/points', label: 'Points' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/invites', label: 'Invites' },
  { href: '/admin/agent-actions', label: 'Agent actions' },
  { href: '/admin/leaderboards', label: 'Leaderboards' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  // Longest-prefix match so /admin/moderation is not also active on
  // /admin/moderation/approval, and /admin only on the dashboard itself.
  const activeHref = LINKS.reduce<string | null>((best, { href }) => {
    const matches = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
    if (matches && (best === null || href.length > best.length)) return href;
    return best;
  }, null);

  return (
    <aside
      className={clsx(
        // Desktop: sticky left rail. Below 860px: horizontal wrapping chip row
        // above the content (see layout.tsx for the flex-direction switch).
        'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]',
        'border-b min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen min-[860px]:w-64 min-[860px]:shrink-0 min-[860px]:border-b-0 min-[860px]:border-r',
      )}
    >
      <nav
        aria-label="Admin"
        className="flex flex-wrap gap-2 px-4 py-3 min-[860px]:flex-col min-[860px]:gap-0.5 min-[860px]:px-3 min-[860px]:py-4"
      >
        {LINKS.map(({ href, label }) => {
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'rounded-[var(--pm-radius-pill)] px-3 py-1.5 text-sm font-medium transition-colors min-[860px]:rounded-lg min-[860px]:px-3 min-[860px]:py-2',
                active
                  ? 'bg-[var(--pm-green-bg)] text-[var(--pm-ink)]'
                  : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]',
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
