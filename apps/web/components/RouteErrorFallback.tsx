'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';

/**
 * Shared body for every route-segment error boundary (07-ux-spec §11).
 *
 * Deliberately dependency-light: no data fetching, no context, no header/rail
 * imports. A boundary renders precisely when something below it is broken, so
 * anything it depends on is another thing that can take the recovery UI down
 * with it.
 *
 * Nothing derived from the error is rendered except `digest` — Next's own
 * server-side hash. The message and stack stay in the browser console so
 * support can correlate by Error ID without the user ever seeing internals.
 */
export interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Route segment this boundary guards; prefixes the console log. */
  scope: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function RouteErrorFallback({
  error,
  reset,
  scope,
  secondaryHref = '/feed',
  secondaryLabel = 'Go to feed',
}: RouteErrorFallbackProps) {
  React.useEffect(() => {
    // lib/logger is pino and server-only, and this app has no Sentry client
    // config, so the browser console is the log sink. One structured line,
    // keyed by digest — the same id rendered below for support.
    console.error('[route-error]', { scope, digest: error.digest ?? null }, error);
  }, [error, scope]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-[560px] flex-col items-center gap-4 rounded-[14px] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-6 py-10 text-center shadow-[var(--pm-shadow)]"
    >
      <h1 className="font-serif text-[22px] font-semibold text-[var(--pm-ink)]">
        Something broke on this page.
      </h1>
      <p className="max-w-[380px] text-[13.5px] leading-[1.5] text-[var(--pm-muted)]">
        The rest of the app is still running. Reload to try again, or head somewhere else.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" size="sm" onClick={reset}>
          Reload page
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={secondaryHref}>{secondaryLabel}</Link>
        </Button>
      </div>

      {error.digest ? (
        <p data-testid="route-error-id" className="text-[11.5px] text-[var(--pm-muted-soft)]">
          Error ID: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
