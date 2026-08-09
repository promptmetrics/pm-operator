'use client';

import * as React from 'react';

/**
 * Last-resort boundary: replaces the root layout when the root layout itself
 * throws, so it must render its own <html> and <body>.
 *
 * Intentionally has ZERO imports from the app — no shared fallback component,
 * no Button, no Link, no stylesheet import. Everything this file depends on is
 * another thing that can be broken at the moment it renders. Styling therefore
 * uses the --pm-* tokens with their literal light-theme values from
 * packages/ui/src/styles/tokens.css as CSS fallbacks, so the page looks right
 * whether or not the token sheet loaded. That duplication is the point; keep
 * the fallbacks in sync if the Paper palette changes.
 *
 * Same contract as the segment boundaries: the message and stack never reach
 * the DOM, only Next's opaque digest.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[route-error]', { scope: 'global', digest: error.digest ?? null }, error);
  }, [error]);

  return (
    <html lang="en" data-theme="paper">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          backgroundColor: 'var(--pm-paper, #e9f1ee)',
          color: 'var(--pm-ink, #161c1a)',
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: '560px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            textAlign: 'center',
            padding: '2.5rem 1.5rem',
            borderRadius: '14px',
            border: '1px solid var(--pm-line, #cddcd6)',
            backgroundColor: 'var(--pm-paper-inset, #f6faf8)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: '22px',
              fontWeight: 600,
            }}
          >
            Something broke on this page.
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: '380px',
              fontSize: '13.5px',
              lineHeight: 1.5,
              color: 'var(--pm-muted, #5e6f68)',
            }}
          >
            The rest of the app is still running. Reload to try again, or head somewhere else.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: '2rem',
                padding: '0 0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: 'var(--pm-coral, #b8446a)',
                color: 'var(--pm-on-ink, #e9f1ee)',
              }}
            >
              Reload page
            </button>
            <a
              href="/feed"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '2rem',
                padding: '0 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid var(--pm-line, #cddcd6)',
                backgroundColor: 'var(--pm-paper-2, #e0ebe7)',
                color: 'var(--pm-ink, #161c1a)',
              }}
            >
              Go to feed
            </a>
          </div>

          {error.digest ? (
            <p
              data-testid="route-error-id"
              style={{
                margin: 0,
                fontSize: '11.5px',
                color: 'var(--pm-muted-soft, #7a8d86)',
              }}
            >
              Error ID: <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
