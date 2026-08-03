import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.1,
  integrations: [Sentry.browserTracingIntegration()],
  beforeSend(event) {
    // In development, suppress events so we don't burn Sentry quota while
    // iterating locally. Set SENTRY_ENABLE_DEV=1 to override.
    if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_ENABLE_DEV) {
      return null;
    }
    return event;
  },
});
