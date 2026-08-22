'use client';

// The mockups' bio-length widget (SEO plan Phase 3c), shared by Settings
// (Settings.dc.html) and Onboarding step 1 (Onboarding.dc.html): a 4px bar
// (paper-3 track, coral fill flipping to green at ≥50 trimmed chars, 0.18s
// width transition) plus a mono counter. Pure function of the textarea value.
//
// Counter strings ship verbatim from the mockups — including the em dash in
// the onboarding earned state, the one documented exception to the no-em-dash
// copy rule.
export function BioLengthMeter({
  value,
  variant,
}: {
  value: string;
  variant: 'settings' | 'onboarding';
}) {
  const n = value.trim().length;
  const met = n >= 50;

  let counterText: string;
  if (met) {
    counterText =
      variant === 'onboarding' ? `${n} characters — bonus unlocked` : `${n} characters`;
  } else if (variant === 'onboarding' && n === 0) {
    counterText = '50 characters to earn the bonus';
  } else {
    counterText = `${50 - n} more to earn the bonus`;
  }

  return (
    <div className="mt-2.5 flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-3)]">
        <div
          className="h-full rounded-[var(--pm-radius-pill)] transition-[width] duration-[180ms] ease-out"
          style={{
            width: `${Math.min(100, Math.round((n / 50) * 100))}%`,
            background: met ? 'var(--pm-green)' : 'var(--pm-coral)',
          }}
        />
      </div>
      <span
        className="font-mono text-xs"
        style={{ color: met ? 'var(--pm-green)' : 'var(--pm-muted)' }}
      >
        {counterText}
      </span>
    </div>
  );
}
