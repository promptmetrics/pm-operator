'use client';

import * as React from 'react';

interface RailContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const RailContext = React.createContext<RailContextValue | null>(null);

const STORAGE_KEY = 'pm-rail-collapsed';

/**
 * Phase 1 app shell: holds the left rail's collapsed state so the Header
 * hamburger (toggle) and LeftRail (visibility) stay in sync. Persisted to
 * localStorage; SSR always renders expanded and the stored preference is
 * applied after mount — a brief flash beats a hydration mismatch.
 */
export function RailProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Private mode / storage disabled: fall back to session-only state.
    }
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage failures; the in-memory state still toggles.
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

export function useRail(): RailContextValue {
  const ctx = React.useContext(RailContext);
  if (!ctx) throw new Error('useRail must be used inside RailProvider');
  return ctx;
}
