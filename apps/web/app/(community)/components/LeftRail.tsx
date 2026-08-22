'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { useRail } from './RailProvider';
import { NAV_ITEMS, isNavItemActive } from './navItems';

/**
 * Rail circle shape (Phase 1 + 3D). postsThisMonth comes from the shared
 * groups-list-stats cache (300 s, merged in the community layout) — the rail
 * renders on every community navigation and its data budget must stay flat,
 * so counts are never queried per-circle.
 */
export interface RailCircle {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  joined: boolean;
  postsThisMonth: number;
}

export function LeftRail({ circles }: { circles: RailCircle[] }) {
  const pathname = usePathname();
  const { collapsed } = useRail();

  if (collapsed) return null;

  return (
    <nav
      aria-label="Primary"
      data-testid="left-rail"
      className="hidden w-[230px] shrink-0 lg:block"
    >
      <div className="sticky top-24 flex flex-col gap-6">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[var(--pm-control-h)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${
                    active
                      ? 'bg-[var(--pm-paper-2)] text-[var(--pm-ink)]'
                      : 'text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 text-[var(--pm-muted)]" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {circles.length > 0 ? (
          <div>
            <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
              Circles
            </p>
            <ul className="flex flex-col gap-0.5">
              {circles.map((circle) => {
                const active =
                  pathname === `/g/${circle.slug}` || pathname.startsWith(`/g/${circle.slug}/`);
                return (
                  <li key={circle.slug}>
                    <Link
                      href={`/g/${circle.slug}`}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[var(--pm-control-h)] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        active
                          ? 'bg-[var(--pm-paper-2)] text-[var(--pm-ink)]'
                          : 'text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: circle.color ?? 'var(--pm-muted-soft)' }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{circle.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          data-testid={`rail-circle-count-${circle.slug}`}
                          className="font-mono text-[11px] tabular-nums text-[var(--pm-muted)]"
                          title="Posts this month"
                        >
                          {circle.postsThisMonth}
                          <span className="sr-only"> posts this month</span>
                        </span>
                        {circle.joined ? (
                          <span className="text-[var(--pm-green)]" title="Joined">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Joined</span>
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
