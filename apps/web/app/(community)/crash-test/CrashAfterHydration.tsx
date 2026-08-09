'use client';

import * as React from 'react';

/**
 * Throws in the browser only, after hydration — the shape of the original
 * /notifications incident, where a React effect threw and, with no boundary
 * anywhere, took the whole document down.
 *
 * The server render succeeds, so the response is a normal 200 and the crash
 * happens client-side, exercising the boundary's client path rather than the
 * server one. Reachable only through the guarded page.tsx alongside it.
 */
export function CrashAfterHydration() {
  const [crash, setCrash] = React.useState(false);

  React.useEffect(() => {
    setCrash(true);
  }, []);

  if (crash) throw new Error('crash-test: deliberate client render failure');

  return <p className="text-[13.5px] text-[var(--pm-muted)]">Preparing crash test…</p>;
}
