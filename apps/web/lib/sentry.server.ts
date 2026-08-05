import * as Sentry from '@sentry/nextjs';

const SENTRY_INITIALIZED = Symbol.for('pm-operator:sentry-server-initialized');

export function initSentryServer() {
  if ((globalThis as any)[SENTRY_INITIALIZED]) {
    return;
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  (globalThis as any)[SENTRY_INITIALIZED] = true;
}

initSentryServer();
