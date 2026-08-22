'use client';

// The landing page's join/register buttons. Client-side only so the CTA can
// fire `landing_cta_click` (payload: which of the three placements converted)
// before following the link; analytics is fire-and-forget and never blocks
// navigation (see lib/analytics.ts).

import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { trackEvent } from '@/lib/analytics';

export type LandingCtaPlacement = 'header' | 'hero' | 'closing';

interface LandingCtaProps {
  label: string;
  placement: LandingCtaPlacement;
  size?: 'sm' | 'lg';
  href?: string;
}

export function LandingCta({
  label,
  placement,
  size = 'lg',
  href = '/register',
}: LandingCtaProps) {
  return (
    <Button
      asChild
      variant="coral"
      size={size}
      onClick={() => trackEvent('landing_cta_click', { placement })}
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}
