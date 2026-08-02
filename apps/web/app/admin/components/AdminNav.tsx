'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Flag, Circle, Eye, Award, Users, LayoutDashboard, CalendarDays, Terminal } from 'lucide-react';

const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/moderation', label: 'Moderation', icon: Flag },
  { href: '/admin/groups', label: 'Circles', icon: Circle },
  { href: '/admin/events', label: 'Events', icon: CalendarDays },
  { href: '/admin/watched-phrases', label: 'Watched phrases', icon: Eye },
  { href: '/admin/badges', label: 'Badges', icon: Award },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/agent-actions', label: 'Agent actions', icon: Terminal },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3">
      <nav className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between" aria-label="Admin">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[var(--pm-coral)]" aria-hidden="true" />
          <span className="font-semibold">Admin</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                    : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
