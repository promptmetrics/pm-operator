'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Search, Menu, X, ChevronDown, LogOut, User, Settings, Award, Bell, Shield } from 'lucide-react';
import { createAuthClient } from '@/lib/auth/client';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { NotificationBell } from './NotificationBell';
import type { UserPublicProfile } from '@pm-operator/api';

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
      .then((json) => setProfile(json?.data ?? null))
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
              <NotificationBell userId={profile.id} />
              <UserDropdown profile={profile} onSignOut={signOut} />
            </>
          ) : (
            <Link href="/login">
              <Button variant="secondary" size="sm">Log in</Button>
            </Link>
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
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar
            src={profile.pictureUrl ?? undefined}
            alt={profile.username}
            fallback={profile.fullName || profile.username}
            size="sm"
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
