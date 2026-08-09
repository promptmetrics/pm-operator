'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { createAuthClient } from '@/auth/client';
import { getAuthCallbackUrl } from '@/site-url';

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/feed';

  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const supabase = createAuthClient();

  function validateEmail(value: string) {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    return undefined;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateEmail(email);
    setError(validation);
    if (validation) return;

    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthCallbackUrl(returnUrl),
    });
    setIsLoading(false);

    // Always show the confirmation message to avoid leaking whether the email
    // is registered. Validation errors are handled before the API call.
    if (resetError) {
      console.warn('Password reset request failed', resetError.message);
    }

    setSent(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <section
        aria-labelledby="reset-heading"
        className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 shadow-[var(--pm-shadow-lg)]"
      >
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--pm-coral-dark)]">
            PromptMetrics Operator
          </p>
          <h1
            id="reset-heading"
            className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[var(--pm-ink)]"
          >
            Reset your password
          </h1>
          <p className="mt-2 text-[var(--pm-muted)]">
            Enter your email and we will send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-[var(--pm-green-line)] bg-[var(--pm-green-bg)] px-3 py-3 text-sm text-[var(--pm-ink)]"
            >
              <MailCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pm-green)]"
                aria-hidden="true"
              />
              <span>
                If an account exists for{' '}
                <span className="font-medium break-all">{email}</span>, you will receive a password
                reset email shortly.
              </span>
            </div>
            <Button asChild variant="secondary" size="lg" className="w-full">
              <Link href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}>Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              id="email"
              type="email"
              label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setError(validateEmail(email))}
              error={error}
              disabled={isLoading}
            />

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              Send reset link
            </Button>
          </form>
        )}

        {sent ? null : (
          <div className="text-center text-sm">
            <Link
              href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}
              className="rounded font-medium text-[var(--pm-link)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]"
            >
              Back to sign in
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-[var(--pm-muted-soft)]">
          EU-hosted · Public knowledge · Agent-ready API
        </p>
      </section>
    </main>
  );
}
