'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { createAuthClient } from '@/auth/client';
import { ensureUserProfile } from './actions';
import { getAuthCallbackUrl } from '@/site-url';
import { GitHubMark, GoogleMark, LinkedInMark } from './ProviderIcons';

type Mode = 'sign-in' | 'sign-up';

const PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub', Mark: GitHubMark },
  { id: 'google', label: 'Continue with Google', Mark: GoogleMark },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', Mark: LinkedInMark },
] as const;

// Shared focus ring for the bare <button>/<a> controls in this card. Button and
// Input already wire this themselves; these three did not.
const FOCUS_RING = 'rounded focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]';

export function LoginForm({ initialMode = 'sign-in' }: { initialMode?: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/feed';

  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  // /auth/callback redirects to /login?error=<msg> when exchangeCodeForSession
  // fails. Seed it once on mount so the OAuth round-trip failure is visible
  // instead of silently dropped; any later interaction clears it.
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; form?: string }>(
    () => {
      const urlError = searchParams.get('error');
      return urlError ? { form: urlError } : {};
    }
  );
  const [isLoading, setIsLoading] = React.useState(false);
  // Set the moment an OAuth handler fires. signInWithOAuth navigates the browser
  // away, so without this the user can click a second provider in the gap.
  const [pendingProvider, setPendingProvider] = React.useState<string | null>(null);

  const busy = isLoading || pendingProvider !== null;

  const supabase = createAuthClient();

  function clearFormError() {
    setErrors((prev) => (prev.form ? { ...prev, form: undefined } : prev));
  }

  function validateField(name: 'email' | 'password', value: string) {
    if (name === 'email') {
      if (!value) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    }
    if (name === 'password') {
      if (!value) return 'Password is required';
      if (value.length < 8) return 'Password must be at least 8 characters';
    }
    return undefined;
  }

  function validateForm() {
    const next = {
      email: validateField('email', email),
      password: validateField('password', password),
    };
    setErrors((prev) => ({ ...prev, ...next }));
    return !next.email && !next.password;
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors((prev) => ({ ...prev, form: undefined }));

    try {
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(returnUrl),
          },
        });
        if (error) {
          setErrors((prev) => ({ ...prev, form: error.message }));
          return;
        }
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrors((prev) => ({ ...prev, form: error.message }));
        return;
      }

      // Create the application-layer user row if this is a fresh signup.
      // Without this row the header and /api/v1/me treat the session as logged-out.
      const ensure = await ensureUserProfile();
      if (ensure.error) {
        setErrors((prev) => ({ ...prev, form: ensure.error }));
        return;
      }

      // Fresh sign-ups (and any account that hasn't finished onboarding) must
      // complete the onboarding wizard before they can interact with the
      // community. Redirect them to /register/complete instead of the target page.
      const meRes = await fetch('/api/v1/me');
      if (meRes.ok) {
        const me = (await meRes.json()) as { data?: { onboardingComplete?: boolean } } | undefined;
        if (!me?.data?.onboardingComplete) {
          router.push(`/register/complete?returnUrl=${encodeURIComponent(returnUrl)}`);
          return;
        }
      }

      router.push(returnUrl);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: (typeof PROVIDERS)[number]['id']) {
    setPendingProvider(provider);
    setErrors((prev) => ({ ...prev, form: undefined }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getAuthCallbackUrl(returnUrl) },
    });
    if (error) {
      // On success the browser is already navigating away, so the pending state
      // is only released on the failure path.
      setPendingProvider(null);
      setErrors((prev) => ({ ...prev, form: error.message }));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <section
        aria-labelledby="auth-heading"
        className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 shadow-[var(--pm-shadow-lg)]"
      >
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--pm-coral-dark)]">
            PromptMetrics Operator
          </p>
          <h1
            id="auth-heading"
            className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[var(--pm-ink)]"
          >
            {mode === 'sign-in' ? 'Welcome back' : 'Join the community'}
          </h1>
          <p className="mt-2 text-[var(--pm-muted)]">
            A Skool-style space for AI operators, founders, and teams shipping with agents.
          </p>
        </div>

        <div className="space-y-3">
          {PROVIDERS.map(({ id, label, Mark }) => (
            <Button
              key={id}
              variant="secondary"
              size="lg"
              className="relative w-full text-base"
              onClick={() => handleOAuth(id)}
              type="button"
              disabled={busy}
            >
              <Mark className="absolute left-4 h-5 w-5 shrink-0" />
              <span>{pendingProvider === id ? 'Redirecting…' : label}</span>
            </Button>
          ))}
          <p className="text-center text-xs text-[var(--pm-muted-soft)]">
            We only read your public profile and email.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--pm-line)]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[var(--pm-paper-inset)] px-2 text-[var(--pm-muted)]">or email</span>
          </div>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
          <Input
            id="email"
            type="email"
            label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFormError();
            }}
            onBlur={() =>
              setErrors((prev) => ({ ...prev, email: validateField('email', email) }))
            }
            error={errors.email}
            disabled={busy}
          />

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              label="Password"
              className="pr-16"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFormError();
              }}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, password: validateField('password', password) }))
              }
              error={errors.password}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={`absolute right-3 top-[2.1rem] px-1 text-sm font-medium text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)] ${FOCUS_RING}`}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {errors.form ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--pm-danger)_35%,transparent)] bg-[var(--pm-danger-bg)] px-3 py-2 text-sm text-[var(--pm-danger)]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errors.form}</span>
            </div>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
              clearFormError();
            }}
            className={`font-medium text-[var(--pm-link)] hover:underline ${FOCUS_RING}`}
          >
            {mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}
          </button>
          <span aria-hidden="true" className="text-[var(--pm-muted-soft)]">
            ·
          </span>
          <Link
            href={`/forgot-password${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
            className={`font-medium text-[var(--pm-link)] hover:underline ${FOCUS_RING}`}
          >
            Forgot password?
          </Link>
        </div>

        <p className="text-center text-xs text-[var(--pm-muted-soft)]">
          EU-hosted · Public knowledge · Agent-ready API
        </p>
      </section>
    </main>
  );
}
