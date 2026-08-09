'use client';

import clsx from 'clsx';
import { AlertTriangle, WifiOff, ShieldOff } from 'lucide-react';

/**
 * Admin-panel error panel.
 *
 * Same stance as the route error boundaries (components/RouteErrorFallback):
 * nothing derived from a caught exception reaches the DOM. This component
 * renders authored copy only, plus an optional short correlation id that
 * support can quote. `message` is typed as a plain string and screened at
 * runtime, so a caller that hands it a thrown error's own text gets the
 * generic line instead of a stack frame, a file path, or a SQL fragment.
 *
 * Callers: keep the caught error in `console.error` and pass a sentence you
 * wrote yourself.
 */
export interface ErrorStateProps {
  title?: string;
  /** Authored, human-readable copy. Never a caught exception's `message`. */
  message?: string;
  /** Short support id, e.g. a Next error digest. Rendered only if id-shaped. */
  correlationId?: string;
  onRetry?: () => void;
  variant?: 'error' | 'network' | 'permission';
  className?: string;
}

const variantConfig = {
  error: {
    icon: AlertTriangle,
    defaultTitle: 'Something went wrong',
  },
  network: {
    icon: WifiOff,
    defaultTitle: 'Network error',
  },
  permission: {
    icon: ShieldOff,
    defaultTitle: 'Permission denied',
  },
} as const;

const GENERIC_MESSAGE =
  'The details were logged rather than shown here. Try again, and note the time if you need to report it.';

/** Authored admin copy is one short line; none of these shapes belong in one. */
const EXCEPTION_SHAPES: readonly RegExp[] = [
  /[\r\n]/, // multi-line — stacks and dumps, never authored copy
  /(?:^|\s)at\s+\S+\s*\(/, // stack frame: "at handler ("
  /\b\w*(?:Error|Exception)\b\s*:/, // "TypeError:", "PostgresError:"
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|EAI_AGAIN)\b/,
  /(?:webpack-internal|file:\/\/|node_modules)/,
  /\.(?:tsx?|jsx?|mjs|cjs):\d+/, // source location
  /(?:^|\s)\/(?:[\w.@-]+\/){2,}/, // absolute path, two or more segments
  /\b(?:relation|column|constraint|table)\s+"/i, // postgres error text
  /\b(?:syntax error at or near|duplicate key value|violates \w+ constraint)\b/i,
  /\b(?:select|insert into|update|delete from)\b[^\r\n]*"[\w.]+"/i, // SQL fragment
];

const MAX_AUTHORED_LENGTH = 240;

/**
 * Returns the message only when it could plausibly have been written by hand.
 * Anything else collapses to `GENERIC_MESSAGE` — failing closed is the point.
 */
export function authoredMessage(message: unknown): string | undefined {
  if (message === undefined || message === null) return undefined;
  if (typeof message !== 'string') return GENERIC_MESSAGE;

  const trimmed = message.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_AUTHORED_LENGTH) return GENERIC_MESSAGE;
  if (EXCEPTION_SHAPES.some((shape) => shape.test(trimmed))) return GENERIC_MESSAGE;

  return trimmed;
}

/** Digests and request ids only; anything else is not an id and is dropped. */
function safeCorrelationId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

export default function ErrorState({
  title,
  message,
  correlationId,
  onRetry,
  variant = 'error',
  className,
}: ErrorStateProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const resolvedTitle = title ?? config.defaultTitle;
  const resolvedMessage = authoredMessage(message);
  const resolvedId = safeCorrelationId(correlationId);

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border px-6 py-10 text-center',
        'border-[var(--pm-danger)]',
        className
      )}
      role="alert"
      style={{ backgroundColor: 'var(--pm-danger-bg)' }}
    >
      <Icon
        className="mb-4 h-10 w-10"
        style={{ color: 'var(--pm-danger)' }}
        aria-hidden="true"
      />

      <h3
        className="text-base font-semibold"
        style={{ color: 'var(--pm-danger)' }}
      >
        {resolvedTitle}
      </h3>

      {resolvedMessage && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--pm-muted)]">
          {resolvedMessage}
        </p>
      )}

      {resolvedId && (
        <p
          data-testid="error-state-id"
          className="mt-2 text-[11.5px] text-[var(--pm-muted-soft)]"
        >
          Error ID: <code className="font-mono">{resolvedId}</code>
        </p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className={clsx(
            'mt-5 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[var(--pm-danger)] text-white',
            'hover:opacity-90 transition-opacity'
          )}
        >
          Try again
        </button>
      )}
    </div>
  );
}
