'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--pm-muted)]" />
      <p className="text-sm text-[var(--pm-muted)]">{message}</p>
    </div>
  );
}
