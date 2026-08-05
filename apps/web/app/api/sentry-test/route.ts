import '@/lib/sentry.server';
import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const hasDsn = !!process.env.SENTRY_DSN;

  const eventId = Sentry.captureException(
    new Error(
      `Sentry shared-init test error from operator.promptmetrics.dev (DSN present: ${hasDsn})`,
    ),
  );

  await Sentry.flush(2000);

  return Response.json({ ok: true, dsn: hasDsn, eventId });
}
