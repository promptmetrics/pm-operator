'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Search, Menu, X, ChevronDown, LogOut, User, Settings, Award, Bell, Shield, Plus, PanelLeft } from 'lucide-react';
import { createAuthClient } from '@/lib/auth/client';
import { trackEvent, identifyAnalytics, analyticsReset } from '@/lib/analytics';
import { levelForScore } from '@pm-operator/api';
import { Button } from '@pm-operator/ui/components/Button';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { OperatorLockup } from '@pm-operator/ui/components/Logo';
import { Progress } from '@pm-operator/ui/components/Progress';
import { NotificationBell } from './NotificationBell';
import { useRail } from './RailProvider';
import { CommandPalette } from './CommandPalette';
import type { UserPublicProfile } from '@pm-operator/api';

// The rail owns primary navigation on lg+ screens; this menu mirrors it for
// the small-screen header hamburger.
const MOBILE_NAV = [
  { href: '/feed', label: 'Home feed' },
  { href: '/bookmarks', label: 'Bookmarks' },
  { href: '/leaderboards', label: 'Leaderboards' },
  { href: '/messages', label: 'Messages' },
  { href: '/digest', label: 'Weekly digest' },
  { href: '/g', label: 'All circles' },
];

interface HeaderProps {
  /**
   * Phase 4 seam: HeaderWithCommandPalette (below) passes the palette's open
   * handler here. Left unset — Header rendered bare, e.g. outside the community
   * layout — the trigger falls back to navigating to /search.
   */
  onSearchClick?: () => void;
}

/**
 * Community-layout mount point for the ⌘K palette. Owns the open state so the
 * header search pill and the global hotkey drive the same dialog, and lives at
 * layout level so the hotkey works on every community page.
 */
export function HeaderWithCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      <Header onSearchClick={() => setOpen(true)} />
      {open ? <CommandPalette onClose={close} /> : null}
    </>
  );
}

export function Header({ onSearchClick }: HeaderProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { collapsed, toggle: toggleRail } = useRail();
  const [profile, setProfile] = React.useState<UserPublicProfile | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    // Anonymous viewers have no session to fetch: without this guard every
    // crawler/anonymous pageview fired a guaranteed-401 /api/v1/me (console
    // noise on every crawl). Same cookie-stem check middleware.ts uses —
    // @supabase/ssr session cookies (sb-<ref>-auth-token[.n]) are JS-readable
    // by design, so presence is detectable without a network call.
    const hasAuthCookie = document.cookie
      .split('; ')
      .some((c) => c.startsWith('sb-') && c.includes('-auth-token'));
    if (!hasAuthCookie) return;

    fetch('/api/v1/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const user = json?.data ?? null;
        setProfile(user);
        if (user) {
          // Fire-and-forget: the endpoint is idempotent per UTC day.
          fetch('/api/v1/daily-visit', { method: 'POST' }).catch(() => {});
          // Product analytics: attribute this session to the user and record a
          // daily visit (once per session — Header mounts once per navigation
          // lifecycle). No-op until PostHog is provisioned.
          identifyAnalytics(user.id);
          trackEvent('daily_visit');
        }
      })
      .catch(() => {});
  }, []);

  const openSearch = () => router.push('/search');
  const handleSearchClick = onSearchClick ?? openSearch;

  const signOut = async () => {
    const client = createAuthClient();
    await client.auth.signOut();
    analyticsReset();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--pm-line)] bg-[var(--pm-paper)]/95 px-4 py-3 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between" aria-label="Main">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Small screens: the hamburger mirrors the rail nav and sits at the
              far left, before the wordmark (reference header). */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((m) => !m)}
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            aria-label="Toggle sidebar"
            aria-expanded={!collapsed}
            onClick={toggleRail}
          >
            <PanelLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Link href="/feed" aria-label="Operator home">
            <OperatorLockup size="md" nameClassName="hidden sm:inline" />
          </Link>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={handleSearchClick}
            className="hidden w-56 items-center gap-2 rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3.5 py-1.5 text-left text-sm text-[var(--pm-muted-soft)] transition-colors hover:bg-[var(--pm-paper-2)] md:flex lg:w-72"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">Search posts, circles, people…</span>
            <kbd className="rounded border border-[var(--pm-line)] bg-[var(--pm-paper)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--pm-muted)]">
              ⌘K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-label="Search"
            onClick={handleSearchClick}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>

          {profile ? (
            <>
              <Button size="sm" asChild className="hidden gap-1 sm:inline-flex">
                <Link href="/post/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New post
                </Link>
              </Button>
              <NotificationBell userId={profile.id} />
              <UserDropdown profile={profile} onSignOut={signOut} />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="secondary" size="sm">Log in</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">Create account</Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {menuOpen ? (
        <div className="mx-auto max-w-7xl px-4 pb-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {MOBILE_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    active
                      ? 'bg-[var(--pm-paper-2)] text-[var(--pm-ink)]'
                      : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {profile ? (
              <Link
                href="/notifications"
                className="rounded-lg px-3 py-2 text-sm text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
              >
                Notifications
              </Link>
            ) : null}
            {profile && isModeratorOrAdmin(profile.role) ? (
              <Link
                href="/moderation"
                className="rounded-lg px-3 py-2 text-sm text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
              >
                Moderation
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function isModeratorOrAdmin(role: string): boolean {
  return role === 'moderator' || role === 'admin';
}

function UserDropdown({
  profile,
  onSignOut,
}: {
  profile: UserPublicProfile;
  onSignOut: () => void;
}) {
  // The level ladder is derived from the reputation score (nothing stored),
  // so the menu header computes it locally — no extra fetch.
  const levelInfo = levelForScore(profile.reputationScore);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar
            src={profile.pictureUrl ?? undefined}
            alt={profile.username}
            fallback={profile.fullName || profile.username}
            size="sm"
            badge={<LevelBadge level={profile.level} size="xs" />}
          />
          <span className="hidden text-sm lg:inline">{profile.fullName || profile.username}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[240px] rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-1 shadow-[var(--pm-shadow-lg)]"
          sideOffset={8}
          align="end"
        >
          {/* Reference menu header: name, level line, pts + streak, then the
              teal level-progress bar with the points-to-next hint. */}
          <div className="mb-1 border-b border-[var(--pm-line)] px-3 pb-3 pt-2">
            <p className="text-sm font-semibold text-[var(--pm-ink)]">
              {profile.fullName || profile.username}
            </p>
            <p className="mt-0.5 text-xs text-[var(--pm-muted)]">
              Lv {levelInfo.level} · {levelInfo.name}
            </p>
            <div className="mt-2.5 flex gap-3.5 text-[12.5px]">
              <span>
                <b className="font-semibold text-[var(--pm-ink)]">
                  {profile.reputationScore.toLocaleString()}
                </b>{' '}
                <span className="text-[var(--pm-muted)]">pts</span>
              </span>
              <span title={`Posting streak: ${profile.streakDays} days`}>
                <span aria-hidden="true">🔥</span>{' '}
                <b className="font-semibold text-[var(--pm-ink)]">{profile.streakDays}</b>{' '}
                <span className="text-[var(--pm-muted)]">day streak</span>
              </span>
            </div>
            <Progress
              value={levelInfo.progressPercent}
              aria-label={`Progress to level ${levelInfo.nextLevel?.level ?? levelInfo.level}`}
              className="mt-2.5"
            />
            <p className="mt-1 text-[11.5px] text-[var(--pm-muted)]">
              {levelInfo.nextLevel && levelInfo.pointsToNext !== null
                ? `${levelInfo.pointsToNext.toLocaleString()} pts to Level ${levelInfo.nextLevel.level} · ${levelInfo.nextLevel.name}`
                : 'Max level'}
            </p>
          </div>
          <DropdownMenu.Item asChild>
            <Link
              href={`/u/${profile.userslug}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/notifications"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              Notifications
            </Link>
          </DropdownMenu.Item>
          {isModeratorOrAdmin(profile.role) ? (
            <DropdownMenu.Item asChild>
              <Link
                href="/moderation"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
              >
                <Shield className="h-4 w-4" aria-hidden="true" />
                Moderation
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href={`/u/${profile.userslug}/devcard`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
            >
              <Award className="h-4 w-4" aria-hidden="true" />
              DevCard
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--pm-line)]" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--pm-ink)] outline-none hover:bg-[var(--pm-paper-2)]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
