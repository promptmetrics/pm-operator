'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <AlertCircle className="h-10 w-10 text-[var(--pm-danger)]" />
      <p className="text-sm text-[var(--pm-muted)]">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
