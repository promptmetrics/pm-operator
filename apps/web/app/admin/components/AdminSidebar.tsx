'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Flag,
  Eye,
  Circle,
  Users,
  Mail,
  CalendarDays,
  Award,
  Trophy,
  Coins,
  BarChart3,
  Terminal,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface Section {
  label: string;
  links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

const SECTIONS: Section[] = [
  {
    label: 'Content',
    links: [
      { href: '/admin/moderation', label: 'Moderation', icon: Flag },
      { href: '/admin/watched-phrases', label: 'Watched phrases', icon: Eye },
    ],
  },
  {
    label: 'Community',
    links: [
      { href: '/admin/groups', label: 'Circles', icon: Circle },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/invites', label: 'Invites', icon: Mail },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
    ],
  },
  {
    label: 'Gamification',
    links: [
      { href: '/admin/badges', label: 'Badges', icon: Award },
      { href: '/admin/leaderboards', label: 'Leaderboards', icon: Trophy },
      { href: '/admin/points', label: 'Points', icon: Coins },
    ],
  },
  {
    label: 'Analytics',
    links: [{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 }],
  },
  {
    label: 'System',
    links: [
      { href: '/admin/agent-actions', label: 'Agent actions', icon: Terminal },
      { href: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function AdminSidebar({ collapsed = false, onToggle }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={clsx(
        'sticky top-0 flex h-screen flex-col border-r border-[var(--pm-line)] bg-[var(--pm-paper-inset)] transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Dashboard link */}
      <div className="flex items-center justify-center border-b border-[var(--pm-line)] px-3 py-4">
        <Link
          href="/admin"
          className={clsx(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive('/admin')
              ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
              : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]',
            collapsed ? 'justify-center px-0' : 'w-full',
          )}
          title={collapsed ? 'Dashboard' : undefined}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Dashboard</span>}
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-6">
            {!collapsed && (
              <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--pm-muted)]">
                {section.label}
              </h3>
            )}
            <ul className="space-y-1">
              {section.links.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(href)
                        ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                        : 'text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]',
                      collapsed && 'justify-center px-0',
                    )}
                    title={collapsed ? label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Toggle button */}
      <div className="border-t border-[var(--pm-line)] p-3">
        <button
          type="button"
          onClick={onToggle}
          className={clsx(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]',
            collapsed ? 'mx-auto justify-center px-0' : 'w-full',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
