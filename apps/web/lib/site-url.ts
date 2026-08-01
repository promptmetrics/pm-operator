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

export function getAuthCallbackUrl(returnUrl: string): string {
  const base = getSiteUrl();
  if (!base) {
    throw new Error(
      'Missing NEXT_PUBLIC_SITE_URL and no window.location.origin available. OAuth/email redirects cannot be constructed.'
    );
  }
  return `${base}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
}
