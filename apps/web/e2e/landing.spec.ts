import { test, expect } from '@playwright/test';

// Landing page (`/`). Anonymous, READ-ONLY — no sign-in, no fixtures, no DB
// writes — because a local run's .env.local points at the production database
// (see MEMORY "CI test-DB isolation"). A GET of `/` never mutates anything, so
// this spec is safe to run against either environment.
//
// The page replaces the old `/` → /feed 308, which had GSC filing /feed as a
// duplicate. These assertions are the SEO contract: a real 200 page with one
// title, one H1, one WebSite JSON-LD, and join CTAs that all reach /register.
//
// Stat values are format-pinned (\d[\d,]*), not exact: they ride the 24 h
// landing cache (lib/services/landing.ts), so the numbers legitimately lag.

const STATS_LABELS = [/operators in the community/, /public builds and teardowns/];

test.describe('landing page', () => {
  test('serves 200 directly, not a redirect', async ({ page, baseURL }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    expect(response?.request().redirectedFrom()).toBeFalsy();
    await expect(page).toHaveURL(new RegExp(`${baseURL?.replace(/\/$/, '')}/$`));
  });

  test('unique title, canonical, exactly one H1 and one JSON-LD block', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Operator Stack/);
    // The canonical must match the sitemap URL byte-for-byte, and the sitemap
    // emits the bare origin (no trailing slash).
    //
    // Mirrors lib/site-url.ts getPublicSiteUrl() rather than hardcoding the
    // production domain, so it holds wherever the suite runs: CI builds and
    // serves with NEXT_PUBLIC_SITE_URL=http://localhost:3000 (ci.yml), and
    // playwright.config.mjs dotenv-loads the same .env.local the local build
    // used, so expectation and page always agree. Hardcoding prod made this
    // the only failing E2E test on main, which skipped the gated deploy job —
    // a wrong assertion here silently blocks every release.
    const expectedCanonical = (
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://operator.promptmetrics.dev'
    ).replace(/\/+$/, '');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      expectedCanonical
    );

    expect(await page.locator('h1').count()).toBe(1);

    const ldJson = page.locator('script[type="application/ld+json"]');
    expect(await ldJson.count()).toBe(1);
    expect(await ldJson.textContent()).toContain('"@type":"WebSite"');
  });

  test('every join CTA points at /register', async ({ page }) => {
    await page.goto('/');
    const ctas = page.getByRole('link', { name: /Join the community|Create your account/ });
    const count = await ctas.count();
    expect(count).toBeGreaterThanOrEqual(3); // header, hero, closing
    for (let i = 0; i < count; i++) {
      await expect(ctas.nth(i)).toHaveAttribute('href', /\/register$/);
    }
  });

  test('the stats rail renders both live counts', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('body');
    for (const label of STATS_LABELS) {
      await expect(main.getByText(label)).toBeVisible();
    }
    // Two 38px serif numbers in the rail — matched loosely as digit groups.
    await expect(main.getByText(/^\d[\d,]*$/).first()).toBeVisible();
  });

  test('key sections are present in mockup order', async ({ page }) => {
    await page.goto('/');
    const headings = page.locator('h2');
    const texts = await headings.allTextContents();
    const expected = [
      'Written by people with your job title',
      'Three builds from this month',
      'Five circles',
      'Your first week',
      'Post your stack. Get it torn apart, kindly.',
    ];
    const actual = texts.filter((t) => expected.includes(t));
    expect(actual).toEqual(expected);
  });
});
