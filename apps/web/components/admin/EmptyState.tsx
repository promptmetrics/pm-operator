'use client';

import * as React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  message?: string;
  icon?: React.ElementType;
}

export function EmptyState({ message = 'No data found', icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Icon className="h-10 w-10 text-[var(--pm-muted)]" />
      <p className="text-sm text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}
