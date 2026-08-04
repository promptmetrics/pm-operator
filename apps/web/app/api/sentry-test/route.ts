import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const hasDsn = !!process.env.SENTRY_DSN;
  Sentry.captureException(
    new Error(
      `Sentry test error from operator.promptmetrics.dev API route (DSN present: ${hasDsn})`,
    ),
  );
  // Wait briefly to give the Sentry SDK time to flush before the route handler ends.
  await Sentry.flush(2000);
  return Response.json({ ok: true, dsn: hasDsn });
}
