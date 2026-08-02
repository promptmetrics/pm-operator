'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Search, Menu, X, ChevronDown, LogOut, User, Settings, Award, Bell, Shield, Flame, Mail } from 'lucide-react';
import { createAuthClient } from '@/lib/auth/client';
import { trackEvent, identifyAnalytics, analyticsReset } from '@/lib/analytics';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { Progress } from '@pm-operator/ui/components/Progress';
import { NotificationBell } from './NotificationBell';
import type { UserPublicProfile, UserBadgesResponse, BadgeProgressItem } from '@pm-operator/api';

const NAV = [
  { href: '/feed', label: 'Feed' },
  { href: '/leaderboards', label: 'Leaderboards' },
  { href: '/search', label: 'Search' },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = React.useState<UserPublicProfile | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
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

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
  };

  const signOut = async () => {
    const client = createAuthClient();
    await client.auth.signOut();
    analyticsReset();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--pm-line)] bg-[var(--pm-paper)]/95 px-4 py-3 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between" aria-label="Main">
        <div className="flex items-center gap-4 md:gap-6">
          <Link href="/feed" className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl font-semibold text-[var(--pm-ink)]">operator</span>
            <span className="hidden text-xs font-medium text-[var(--pm-coral)] sm:inline">.promptmetrics</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-[var(--pm-paper-2)] text-[var(--pm-ink)]'
                      : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <form onSubmit={onSearch} className="hidden items-center md:flex">
            <Input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-48 lg:w-64"
            />
            <Button type="submit" variant="ghost" size="sm" aria-label="Search">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-label="Search"
            onClick={() => setSearchOpen((s) => !s)}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
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

          {profile ? (
            <>
              <span className="hidden text-[13px] font-semibold text-[var(--pm-ink-2)] md:inline-flex">
                {profile.reputationScore.toLocaleString()} pts
              </span>
              {profile.streakDays > 0 ? (
                <span
                  className="hidden items-center gap-1 rounded-full border border-[var(--pm-line)] px-2 py-0.5 text-[13px] md:inline-flex"
                  title={`Posting streak: ${profile.streakDays} days`}
                >
                  <Flame className="h-3.5 w-3.5 text-[var(--pm-coral)]" aria-hidden="true" />
                  {profile.streakDays}
                </span>
              ) : null}
              <Link
                href="/messages"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--pm-ink)] hover:bg-[var(--pm-paper-inset)]"
                aria-label="Messages"
              >
                <Mail className="h-5 w-5" aria-hidden="true" />
              </Link>
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

      {searchOpen ? (
        <form onSubmit={onSearch} className="mx-auto mt-2 flex max-w-6xl items-center px-4 md:hidden">
          <Input
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" variant="ghost" size="sm" aria-label="Search">
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      ) : null}

      {menuOpen ? (
        <div className="mx-auto max-w-6xl px-4 pb-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
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
  const [badges, setBadges] = React.useState<UserBadgesResponse | null>(null);
  const fetchedBadges = React.useRef(false);

  // GAME-7: lazily load badge progress the first time the dropdown opens.
  const onOpenChange = (open: boolean) => {
    if (!open || fetchedBadges.current) return;
    fetchedBadges.current = true;
    fetch(`/api/v1/users/${profile.userslug}/badges`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setBadges(json?.data ?? null))
      .catch(() => {});
  };

  const nextBadge: BadgeProgressItem | null = React.useMemo(() => {
    if (!badges || badges.progress.length === 0) return null;
    return [...badges.progress].sort(
      (a, b) => b.current / b.threshold - a.current / a.threshold
    )[0];
  }, [badges]);

  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
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
          className="z-50 min-w-[200px] rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-1 shadow-[var(--pm-shadow-lg)]"
          sideOffset={8}
          align="end"
        >
          {nextBadge ? (
            <>
              <div className="px-3 py-2">
                <p className="mb-1.5 text-xs text-[var(--pm-muted)]">
                  Next badge: <span className="font-medium text-[var(--pm-ink)]">{nextBadge.badge.name}</span>
                </p>
                <Progress
                  value={(nextBadge.current / nextBadge.threshold) * 100}
                  aria-label={`Progress toward ${nextBadge.badge.name}`}
                />
                <p className="mt-1 text-xs text-[var(--pm-muted)]">
                  {nextBadge.current}/{nextBadge.threshold}
                </p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--pm-line)]" />
            </>
          ) : null}
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
