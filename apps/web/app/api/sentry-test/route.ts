import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const dsn = process.env.SENTRY_DSN;

  // Force-initialize Sentry explicitly inside the route handler. This is
  // only for diagnosing whether the issue is initialization vs capture.
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });

  const hasDsn = !!dsn;
  const eventId = Sentry.captureException(
    new Error(
      `Sentry explicit-init test error from operator.promptmetrics.dev (DSN present: ${hasDsn})`,
    ),
  );

  await Sentry.flush(2000);

  return Response.json({ ok: true, dsn: hasDsn, eventId });
}
