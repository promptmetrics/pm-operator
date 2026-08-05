'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Eye, X, EyeOff, AlertTriangle, Ban } from 'lucide-react';

interface ModerationActionsProps {
  onView?: () => void;
  onDismiss?: () => void;
  onHide?: () => void;
  onWarn?: () => void;
  onBan?: () => void;
  disabled?: boolean;
}

export function ModerationActions({
  onView,
  onDismiss,
  onHide,
  onWarn,
  onBan,
  disabled = false,
}: ModerationActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {onView && (
        <Button variant="secondary" size="sm" onClick={onView} disabled={disabled}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          View
        </Button>
      )}
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={disabled}>
          <X className="mr-1 h-3.5 w-3.5" />
          Dismiss
        </Button>
      )}
      {onHide && (
        <Button variant="danger" size="sm" onClick={onHide} disabled={disabled}>
          <EyeOff className="mr-1 h-3.5 w-3.5" />
          Hide content
        </Button>
      )}
      {onWarn && (
        <Button variant="secondary" size="sm" onClick={onWarn} disabled={disabled}>
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          Warn user
        </Button>
      )}
      {onBan && (
        <Button variant="danger" size="sm" onClick={onBan} disabled={disabled}>
          <Ban className="mr-1 h-3.5 w-3.5" />
          Ban user
        </Button>
      )}
    </div>
  );
}
