import { getPublicSiteUrl } from '@/lib/site-url';

// /llms.txt — a plain-text map for LLM agents (llmstxt.org convention).
// No citation weight with Google today; forward-positioning only (audit
// backlog). Static content, so it can be served without touching the DB.
export async function GET() {
  const siteUrl = getPublicSiteUrl();
  const body = `# Operator Stack community

> Community forum at ${siteUrl} where RevOps managers, CS directors, DTC
> founders, and marketing-ops leads discuss orchestrating their SaaS tools
> (HubSpot, Salesforce, etc.) with coding agents. Run by PromptMetrics
> (https://www.promptmetrics.dev).

## Content

- [Community feed](${siteUrl}/feed): latest public posts across all circles
- [Sitemap](${siteUrl}/sitemap.xml): all public circles, posts, and author profiles

## Machine access

- MCP server (read-only community data, OAuth 2.1): ${siteUrl}/api/mcp
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
