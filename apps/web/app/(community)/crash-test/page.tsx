import { notFound } from 'next/navigation';
import { CrashAfterHydration } from './CrashAfterHydration';

/**
 * Test-only crash route (/crash-test), used by e2e/error-boundary.spec.ts to
 * prove that (community)/error.tsx contains a failure without blanking the
 * document.
 *
 * The folder is deliberately NOT named `_crash-test`: a leading underscore
 * makes Next treat it as a private folder and drop it from the route table
 * entirely, which would 404 in CI too and prove nothing. Containment is the
 * runtime guard below, not the filename.
 *
 * GUARD — fail-closed, and both conditions must hold for the route to do
 * anything at all:
 *
 *   1. E2E_TEST_ROUTES must be exactly '1'. It is a server-only runtime var
 *      (no NEXT_PUBLIC_ prefix, so it is never inlined into a client bundle)
 *      and it is set in exactly one place: the "Run E2E" step of
 *      .github/workflows/ci.yml. Unset — which is every other environment,
 *      including local dev and every Vercel deployment — this route 404s.
 *      Note this is deliberately NOT a NODE_ENV check: CI runs Playwright
 *      against `next build && next start`, where NODE_ENV *is* 'production',
 *      so a NODE_ENV guard would disable the route in the one place it is
 *      needed and prove nothing.
 *
 *   2. VERCEL_ENV must not be 'production'. Belt and braces: if the flag ever
 *      leaked into the production environment by mistake, the route still
 *      404s there.
 *
 * force-dynamic keeps it out of the prerender pass, so a build never evaluates
 * the throw.
 */
export const dynamic = 'force-dynamic';

function testRoutesEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  return process.env.E2E_TEST_ROUTES === '1';
}

export default async function CrashTestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  if (!testRoutesEnabled()) notFound();

  const { mode } = await searchParams;

  // ?mode=client reproduces the original /notifications incident shape: a
  // client component throwing in the browser after hydration, not on the
  // server. The default is a server-render throw, which also gives Next a
  // digest so the spec can assert the Error ID renders.
  if (mode === 'client') return <CrashAfterHydration />;

  throw new Error('crash-test: deliberate server render failure');
}
