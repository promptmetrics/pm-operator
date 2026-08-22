'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Check, Plus, Shield, X } from 'lucide-react';
import { NAV_ITEMS, isNavItemActive } from './navItems';
import type { RailCircle } from './LeftRail';

/**
 * Small-screen primary navigation. Mount = open, matching CommandPalette, so
 * the open/close effects need no `open` guard and the header owns the state.
 *
 * This replaced an inline panel rendered inside the sticky <header>, which had
 * none of the dismissal behaviour a modal surface needs: it survived route
 * changes (tap a link, land on the new page, menu still covering it), ignored
 * Escape, let the page behind it scroll, and grew the sticky bar when open.
 * The rail's circle list had no mobile equivalent at all.
 */

export const MOBILE_NAV_ID = 'mobile-nav';

const ROW =
  'flex min-h-[var(--pm-control-h)] items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm';
const ROW_IDLE = 'text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]';
const ROW_ACTIVE = 'bg-[var(--pm-paper-2)] font-medium text-[var(--pm-ink)]';

interface MobileNavProps {
  onClose: () => void;
  /** Omitted on shells that never mount the rail (admin), which hides the section. */
  circles?: RailCircle[];
  /** Signed-in extras: compose, notifications. */
  signedIn: boolean;
  isModerator: boolean;
}

export function MobileNav({ onClose, circles, signedIn, isModerator }: MobileNavProps) {
  const pathname = usePathname();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  // Capture the trigger, move focus into the drawer, and lock body scroll; the
  // cleanup restores all three, so closing returns focus to the hamburger.
  React.useEffect(() => {
    const previous = document.activeElement;
    restoreFocusRef.current =
      previous instanceof HTMLElement && previous !== document.body ? previous : null;
    panelRef.current?.querySelector<HTMLElement>('a, button:not([disabled])')?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  // Close once the route actually changes. Comparing against the mount-time
  // path matters: a bare [pathname] effect fires on mount and would slam the
  // drawer shut the moment it opened. Links also call onClose directly so the
  // dismissal is immediate rather than waiting for the navigation to commit;
  // this covers back/forward and any programmatic push.
  const openedAtRef = React.useRef(pathname);
  React.useEffect(() => {
    if (pathname !== openedAtRef.current) onClose();
  }, [pathname, onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = panelRef.current?.querySelectorAll<HTMLElement>('a, button:not([disabled])');
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--pm-ink)]/40 backdrop-blur-sm lg:hidden"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* A full-height sheet rather than a panel offset under the sticky bar:
          the header's height varies with the coarse-pointer control token, so
          there is no fixed offset to hardcode. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        id={MOBILE_NAV_ID}
        data-testid="mobile-nav"
        onKeyDown={onKeyDown}
        className="flex h-full w-[min(86vw,320px)] flex-col overflow-y-auto border-r border-[var(--pm-line)] bg-[var(--pm-paper)] shadow-[var(--pm-shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--pm-line)] px-3 py-3">
          <span className="px-1 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex min-h-[var(--pm-control-h)] min-w-[var(--pm-control-h)] items-center justify-center rounded-lg text-[var(--pm-ink-2)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-6 px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {signedIn ? (
              <li>
                <Link
                  href="/post/new"
                  onClick={onClose}
                  className={`${ROW} bg-[var(--pm-coral)] font-semibold text-[var(--pm-on-ink)] hover:opacity-90`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New post
                </Link>
              </li>
            ) : null}
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE}`}
                  >
                    <Icon className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {signedIn ? (
              <li>
                <Link
                  href="/notifications"
                  onClick={onClose}
                  aria-current={pathname === '/notifications' ? 'page' : undefined}
                  className={`${ROW} ${pathname === '/notifications' ? ROW_ACTIVE : ROW_IDLE}`}
                >
                  <Bell className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
                  Notifications
                </Link>
              </li>
            ) : null}
            {isModerator ? (
              <li>
                <Link
                  href="/moderation"
                  onClick={onClose}
                  aria-current={isNavItemActive('/moderation', pathname) ? 'page' : undefined}
                  className={`${ROW} ${
                    isNavItemActive('/moderation', pathname) ? ROW_ACTIVE : ROW_IDLE
                  }`}
                >
                  <Shield className="h-4 w-4 text-[var(--pm-muted)]" aria-hidden="true" />
                  Moderation
                </Link>
              </li>
            ) : null}
          </ul>

          {/* Mirrors LeftRail's circle list — colour dot, name, posts this month,
              joined tick — from the same array the layout already queries. */}
          {circles && circles.length > 0 ? (
            <div>
              <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-[var(--pm-muted-soft)]">
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
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`${ROW} justify-between ${active ? ROW_ACTIVE : ROW_IDLE}`}
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
        </nav>
      </div>
    </div>
  );
}
