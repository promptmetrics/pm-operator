'use client';

import * as React from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';

interface DevCardActionsProps {
  /** Absolute URL of the public DevCard page. */
  shareUrl: string;
  /** Path of the PNG route; served same-origin so `download` is honoured. */
  pngPath: string;
  /** Used for the saved filename. */
  userslug: string;
}

// T5G: Copy link + Download PNG. Client-only because both need the browser —
// the clipboard API and an anchor `download`. Everything else on the DevCard
// page stays a server component.
export function DevCardActions({ shareUrl, pngPath, userslug }: DevCardActionsProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard is unavailable (insecure origin, denied permission). The URL
      // is in the address bar anyway, so there is nothing useful to recover.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={copyLink}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? 'Link copied' : 'Copy link'}
      </Button>

      <Button variant="secondary" size="sm" asChild>
        <a href={pngPath} download={`devcard-${userslug}.png`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PNG
        </a>
      </Button>

      <span aria-live="polite" className="sr-only">
        {copied ? 'DevCard link copied to clipboard' : ''}
      </span>
    </div>
  );
}
