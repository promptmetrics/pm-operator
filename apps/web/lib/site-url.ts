/**
 * Return the canonical public site URL.
 *
 * In the browser we prefer an explicit env override so OAuth/email redirects
 * point to the right origin even when the Supabase dashboard or a preview
 * deploy would otherwise default to localhost. Falls back to the current page
 * origin for local development.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

/**
 * Origin for anything a crawler will compare against something else we publish —
 * canonicals, sitemap `<loc>`s, robots.txt `Host`/`Sitemap`, OG urls.
 *
 * Differs from getSiteUrl() in the two ways that matter server-side:
 *   - it never returns '' (getSiteUrl does, when the env var is unset and there
 *     is no window), which would emit a canonical of `/g/foo/bar`;
 *   - its fallback is this host. Four call sites previously fell back to
 *     `https://promptmetrics.dev` — the marketing site — so a missing env var
 *     pointed every operator canonical at a different domain.
 *
 * The trailing-slash strip is what keeps a canonical byte-identical to the
 * sitemap entry for the same page. sitemap.ts stripped it, the post page did
 * not; one stray slash in NEXT_PUBLIC_SITE_URL and they disagree, which is how
 * you earn "Duplicate without user-selected canonical".
 *
 * Not for OAuth: lib/oauth/constants.ts intentionally uses getSiteUrl(), whose
 * issuer URL must stay exactly as configured.
 */
export function getPublicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://operator.promptmetrics.dev';
}

export function getAuthCallbackUrl(returnUrl: string): string {
  const base = getSiteUrl();
  if (!base) {
    throw new Error(
      'Missing NEXT_PUBLIC_SITE_URL and no window.location.origin available. OAuth/email redirects cannot be constructed.'
    );
  }
  return `${base}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
}
