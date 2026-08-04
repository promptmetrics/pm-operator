'use client';

import * as React from 'react';
import { Shield, Menu } from 'lucide-react';
import clsx from 'clsx';

interface AdminNavProps {
  onMenuToggle?: () => void;
}

export function AdminNav({ onMenuToggle }: AdminNavProps) {
  return (
    <header className="border-b border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMenuToggle}
            className="flex items-center justify-center rounded-lg p-1.5 text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Shield className="h-5 w-5 text-[var(--pm-coral)]" aria-hidden="true" />
          <span className="font-semibold">Admin</span>
        </div>
        <span
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium',
            'bg-[var(--pm-paper-2)] text-[var(--pm-muted)]',
          )}
        >
          Admin
        </span>
      </div>
    </header>
  );
}
