import { test, expect, type Page } from '@playwright/test';

// Mobile layout contract at an iPhone 14 viewport (390x844).
//
// Anonymous and READ-ONLY — no sign-in, no fixtures, no DB writes — because a
// local run's .env.local points at the production database (see MEMORY "CI
// test-DB isolation"). Same discipline as landing.spec.ts.
//
// The objective symptom of "it looks bad on mobile" is horizontal overflow, so
// that is what these assert. Before the mobile-first pass, `/` failed: its
// wrapper was an unconditional px-10 (310px of content box at 390px) holding a
// grid-cols-[minmax(0,1fr)_300px] hero with a gap-[72px], i.e. 372px of
// intrinsic width. The drawer tests cover the hamburger, which had no
// behavioural coverage at all — app-shell.spec.ts only exercises the desktop
// rail.

const MOBILE = { width: 390, height: 844 };

// Genuinely public routes, verified against middleware.ts: /leaderboards,
// /bookmarks and /messages all 307 to /login for anonymous viewers, so listing
// them here would have measured the login page and passed for the wrong
// reason. Each test asserts it stayed on the requested path for that reason.
const PUBLIC_ROUTES = ['/', '/guidelines', '/feed', '/g', '/digest', '/login'];

// While the drawer is open it is an aria-modal dialog, which correctly removes
// the rest of the page from the accessibility tree — so getByRole cannot see
// the trigger any more. Address it by attribute instead.
const MENU_TRIGGER = 'button[aria-label="Menu"]';

test.use({ viewport: MOBILE });

test.describe('mobile layout', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} does not overflow horizontally at 390px`, async ({ page }) => {
      await page.goto(route);
      // A protected route would 307 to /login and then pass trivially.
      expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(route.replace(/\/$/, ''));
      // documentElement rather than body: the body can be narrower than an
      // overflowing descendant, which would hide the failure.
      //
      // On failure, name the culprits. A bare "overflows by Npx" is not
      // actionable when the offending element depends on seeded data — CI's
      // test project has different circles than a local prod-pointing run, so
      // a route can overflow there and not here.
      const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
        const docEl = document.documentElement;
        const limit = docEl.clientWidth;
        const culprits: string[] = [];
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right <= limit + 1 && r.left >= -1) continue;
          // Report the outermost offenders only; a wide child drags its
          // ancestors along and the list becomes noise.
          if (culprits.length >= 6) break;
          const cls = (el.getAttribute('class') ?? '').slice(0, 120);
          culprits.push(
            `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).slice(0, 6).join('.') : ''} ` +
              `[left=${Math.round(r.left)} right=${Math.round(r.right)} w=${Math.round(r.width)}]`
          );
        }
        return { scrollWidth: docEl.scrollWidth, clientWidth: limit, offenders: culprits };
      });
      // +1 absorbs sub-pixel rounding on fractional layout widths.
      expect(
        scrollWidth,
        `${route} overflows by ${scrollWidth - clientWidth}px at ${MOBILE.width}px ` +
          `(clientWidth=${clientWidth}).\nOffending elements:\n  ${
            offenders.length ? offenders.join('\n  ') : '(none wider than the viewport — ' +
              'likely a scrollbar or sub-pixel rounding artifact rather than a real element)'
          }`
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test('the landing hero stacks instead of sitting beside the stats rail', async ({ page }) => {
    await page.goto('/');
    const heroBox = await page.locator('h1').boundingBox();
    const statBox = await page.getByText(/operators in the community/).boundingBox();
    expect(heroBox).not.toBeNull();
    expect(statBox).not.toBeNull();
    // Share a left edge = same column = stacked. Checking "stats below the
    // heading" is NOT enough: with the old 62px h1 squeezed into a narrow
    // side-by-side column, the heading grew tall enough that the bottom-aligned
    // stats rail still started below it, so that assertion passed on the
    // broken layout too.
    expect(Math.abs(statBox!.x - heroBox!.x)).toBeLessThan(24);
  });
});

test.describe('mobile navigation drawer', () => {
  // The drawer renders for anonymous viewers too (without the signed-in
  // compose/notifications rows), so the whole dismissal contract is testable
  // without creating a user.
  const openDrawer = async (page: Page) => {
    const trigger = page.locator(MENU_TRIGGER);
    await trigger.click();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    return trigger;
  };

  test('the hamburger is exposed correctly and controls a real element', async ({ page }) => {
    await page.goto('/feed');
    const trigger = page.locator(MENU_TRIGGER);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Before the drawer existed the trigger was reachable by role at all
    // times, because nothing it opened was ever a modal.
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();

    const controls = await trigger.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // aria-controls must resolve, which it could not before: the trigger
    // pointed at nothing and the panel carried no id.
    await expect(page.locator(`#${controls}`)).toBeVisible();
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto('/feed');
    await openDrawer(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  });

  test('clicking the backdrop closes it', async ({ page }) => {
    await page.goto('/feed');
    await openDrawer(page);
    // The sheet is 320px wide at most, so the far right edge is backdrop.
    await page.mouse.click(MOBILE.width - 8, MOBILE.height / 2);
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  });

  test('the close button closes it and returns focus to the hamburger', async ({ page }) => {
    await page.goto('/feed');
    const trigger = await openDrawer(page);
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('it closes after navigating, and does not reopen on the new route', async ({ page }) => {
    await page.goto('/feed');
    await openDrawer(page);
    await page.getByTestId('mobile-nav').getByRole('link', { name: 'Guidelines' }).click();
    await page.waitForURL('**/guidelines');
    // The regression that made this feel broken: the panel used to survive the
    // navigation and cover the page it had just navigated to.
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
    await expect(page.locator(MENU_TRIGGER)).toHaveAttribute('aria-expanded', 'false');
  });

  test('it locks page scroll while open and restores it on close', async ({ page }) => {
    await page.goto('/feed');
    const before = await page.evaluate(() => document.body.style.overflow);

    await openDrawer(page);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(before);
  });

  test('the drawer itself does not overflow the viewport', async ({ page }) => {
    await page.goto('/feed');
    await openDrawer(page);
    const box = await page.getByTestId('mobile-nav').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width + 1);
  });

  test('the hamburger is absent on desktop, where the rail owns navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/feed');
    await expect(page.locator(MENU_TRIGGER)).toBeHidden();
    await expect(page.getByTestId('left-rail')).toBeVisible();
  });
});
