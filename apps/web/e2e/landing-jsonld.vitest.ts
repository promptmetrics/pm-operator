// WebSite JSON-LD emitted by the landing page (`app/page.tsx`). No DB, no
// network — the builder is a pure function.
//
// The graph moved here from /feed when `/` stopped being a 308: the entry page
// is now the site's front door, and its WebSite node is what Google merges
// with www's Organization. What this pins:
//   - the @graph shape Google needs (WebSite + minimal Organization stub)
//   - publisher linkage by @id into www's Organization, never a second full
//     Organization definition on this subdomain
//   - the WebSite node's url carries no trailing slash mismatch
import { describe, expect, test } from 'vitest';

import { buildWebSiteJsonLd, WWW_ORGANIZATION_ID } from '../lib/seo/site-jsonld';
import { serializeJsonLd } from '../lib/seo/post-jsonld';

const SITE = 'https://operator.example.com';

describe('buildWebSiteJsonLd', () => {
  test('emits a two-node graph: WebSite plus an Organization stub', () => {
    const jsonLd = buildWebSiteJsonLd(SITE);
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@graph']).toHaveLength(2);
    const [site, org] = jsonLd['@graph'];
    expect(site['@type']).toBe('WebSite');
    expect(org['@type']).toBe('Organization');
  });

  test('the WebSite references the www Organization by @id, never defines it', () => {
    const [site, org] = buildWebSiteJsonLd(SITE)['@graph'];
    // @type literals discriminate the heterogeneous graph tuple.
    if (site['@type'] !== 'WebSite') throw new Error('first graph node must be the WebSite');
    expect(site.publisher['@id']).toBe(WWW_ORGANIZATION_ID);
    // The stub stays minimal: @id/name/url only. Logo, founders, and sameAs
    // live on www — growing this object forks the entity graph.
    expect(org['@id']).toBe(WWW_ORGANIZATION_ID);
    expect(Object.keys(org).sort()).toEqual(['@id', '@type', 'name', 'url']);
  });

  test('the WebSite node is anchored to the site root', () => {
    const [site] = buildWebSiteJsonLd(SITE)['@graph'];
    expect(site['@id']).toBe(`${SITE}/#website`);
    expect(site.url).toBe(SITE);
  });

  test('WWW_ORGANIZATION_ID matches the www repo declaration', () => {
    expect(WWW_ORGANIZATION_ID).toBe('https://www.promptmetrics.dev/#organization');
  });

  test('serializeJsonLd keeps the graph valid JSON', () => {
    const parsed = JSON.parse(serializeJsonLd(buildWebSiteJsonLd(SITE)));
    expect(parsed['@graph'][1]['@id']).toBe(WWW_ORGANIZATION_ID);
  });
});
