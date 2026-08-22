import { Bookmark, Home, Mail, Newspaper, ScrollText, Trophy, Users } from 'lucide-react';

/**
 * Primary navigation, shared by the desktop LeftRail and the small-screen
 * MobileNav drawer. It used to be declared twice — the rail's list with icons
 * and a label-only copy in Header.tsx — which had already drifted apart.
 */
export const NAV_ITEMS = [
  { href: '/feed', label: 'Home feed', icon: Home },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
  { href: '/leaderboards', label: 'Leaderboards', icon: Trophy },
  { href: '/guidelines', label: 'Guidelines', icon: ScrollText },
  { href: '/messages', label: 'Messages', icon: Mail },
  { href: '/digest', label: 'Weekly digest', icon: Newspaper },
  { href: '/g', label: 'All circles', icon: Users },
] as const;

/**
 * "/g" matches exactly so circle pages highlight their own circle row rather
 * than the directory link; everything else matches on prefix.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/g') return pathname === '/g';
  return pathname === href || pathname.startsWith(`${href}/`);
}
