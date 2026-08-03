'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { createAuthClient } from '@/auth/client';
import { ensureUserProfile } from './actions';
import { getAuthCallbackUrl } from '@/site-url';

type Mode = 'sign-in' | 'sign-up';

const PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn' },
] as const;

export function LoginForm({ initialMode = 'sign-in' }: { initialMode?: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/feed';

  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; form?: string }>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const supabase = createAuthClient();

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

      router.push(returnUrl);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: (typeof PROVIDERS)[number]['id']) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getAuthCallbackUrl(returnUrl) },
    });
    if (error) {
      setErrors((prev) => ({ ...prev, form: error.message }));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-8 shadow-[var(--pm-shadow-lg)]">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--pm-coral-dark)]">
            PromptMetrics Operator
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[var(--pm-ink)]">
            {mode === 'sign-in' ? 'Welcome back' : 'Join the community'}
          </h1>
          <p className="mt-2 text-[var(--pm-muted)]">
            A Skool-style space for AI operators, founders, and teams shipping with agents.
          </p>
        </div>

        <div className="space-y-3">
          {PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => handleOAuth(provider.id)}
              type="button"
            >
              {provider.label}
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
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() =>
              setErrors((prev) => ({ ...prev, email: validateField('email', email) }))
            }
            error={errors.email}
            disabled={isLoading}
          />

          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              label="Password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() =>
                setErrors((prev) => ({ ...prev, password: validateField('password', password) }))
              }
              error={errors.password}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-[2.1rem] text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {errors.form ? (
            <p className="text-sm text-[var(--pm-danger)]" role="alert">
              {errors.form}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'))}
            className="text-[var(--pm-link)] hover:underline"
          >
            {mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}
          </button>
          <span className="text-[var(--pm-muted)]">·</span>
          <Link
            href={`/forgot-password${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
            className="text-[var(--pm-link)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <p className="text-center text-xs text-[var(--pm-muted-soft)]">
          EU-hosted · Public knowledge · Agent-ready API
        </p>
      </div>
    </main>
  );
}
