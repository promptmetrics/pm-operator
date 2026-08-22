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
  /** Responsive visibility for the header placement, which does not fit a 390px bar. */
  className?: string;
}

export function LandingCta({
  label,
  placement,
  size = 'lg',
  href = '/register',
  className,
}: LandingCtaProps) {
  return (
    <Button
      asChild
      variant="coral"
      size={size}
      className={className}
      onClick={() => trackEvent('landing_cta_click', { placement })}
    >
      {/* The labels are full sentences; without this they wrap inside the pill
          and spill past its rounded edge on a narrow viewport. */}
      <Link href={href} className="whitespace-nowrap">
        {label}
      </Link>
    </Button>
  );
}
