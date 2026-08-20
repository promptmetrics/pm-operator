/**
 * Site-level structured data: WebSite, BreadcrumbList, CollectionPage.
 *
 * The Organization entity is OWNED by www.promptmetrics.dev — its schema
 * declares `@id: https://www.promptmetrics.dev/#organization` (see the www
 * repo's config/seo.config.ts). Everything here references that `@id` instead
 * of defining a second Organization, so Google merges the two subdomains into
 * one entity graph rather than creating a duplicate. Do not change this string
 * without changing it on www first.
 */

export const WWW_ORGANIZATION_ID = 'https://www.promptmetrics.dev/#organization';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'BreadcrumbList' as const,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Entry-page graph: the WebSite node for this subdomain plus a minimal
 * Organization stub. The stub carries only @id/name/url — enough for parsers
 * to resolve the publisher reference; the authoritative definition (logo,
 * founders, sameAs) stays on www.
 */
export function buildWebSiteJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org' as const,
    '@graph': [
      {
        '@type': 'WebSite' as const,
        '@id': `${siteUrl}/#website`,
        name: 'Operator Stack community',
        url: siteUrl,
        publisher: { '@id': WWW_ORGANIZATION_ID },
      },
      {
        '@type': 'Organization' as const,
        '@id': WWW_ORGANIZATION_ID,
        name: 'PromptMetrics',
        url: 'https://www.promptmetrics.dev',
      },
    ],
  };
}

export function buildCollectionPageJsonLd(input: {
  name: string;
  description: string;
  url: string;
  siteUrl: string;
}) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'CollectionPage' as const,
    '@id': input.url,
    name: input.name,
    description: input.description,
    url: input.url,
    isPartOf: { '@id': `${input.siteUrl}/#website` },
    publisher: { '@id': WWW_ORGANIZATION_ID },
  };
}
