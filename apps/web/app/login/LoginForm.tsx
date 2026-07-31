'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { createAuthClient } from '@/auth/client';

type Mode = 'sign-in' | 'sign-up';

const PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn' },
] as const;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/feed';

  const [mode, setMode] = React.useState<Mode>('sign-in');
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
            emailRedirectTo: `${window.location.origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`,
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

      router.push(returnUrl);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: (typeof PROVIDERS)[number]['id']) {
    const redirectTo = `${window.location.origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setErrors((prev) => ({ ...prev, form: error.message }));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">operator.promptmetrics.dev</h1>
          <p className="mt-2 text-muted-foreground">
            A community for AI operators, founders, and teams building with AI.
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
          <p className="text-center text-xs text-muted-foreground">
            We only read your public profile and email.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">or email</span>
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
              className="absolute right-3 top-[2.1rem] text-sm text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {errors.form ? (
            <p className="text-sm text-error" role="alert">
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
            className="text-accent hover:underline"
          >
            {mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}
          </button>
          <span className="text-muted-foreground">·</span>
          <Link
            href={`/forgot-password${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
            className="text-accent hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          EU-hosted · Public knowledge · Agent-ready API
        </p>
      </div>
    </main>
  );
}
