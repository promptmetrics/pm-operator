import './lib/sentry.server';
import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Server-side Sentry initialization is handled by lib/sentry.server.ts,
  // which is imported above. This ensures the SDK is also ready inside
  // App Router route handlers and server components.
}

export const onRequestError = Sentry.captureRequestError;
