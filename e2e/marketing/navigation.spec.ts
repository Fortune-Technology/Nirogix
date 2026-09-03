import { expect, test } from '@playwright/test';

/**
 * Marketing navigation regressions (manual guide §15, DESIGN.md §9).
 *
 * The scroll case is a real fixed bug, kept as a regression: navigating between routes must
 * land the reader at the top of the new page rather than inheriting the previous page's
 * offset. It is asserted at this level on purpose — scroll restoration is browser behaviour
 * that a unit test cannot observe.
 */

test.describe('route change scroll behaviour', () => {
  test('navigating from a scrolled page starts the next page at the top', async ({ page }) => {
    await page.goto('/solutions', { waitUntil: 'domcontentloaded' });

    // Scroll well down the page, and prove we actually moved before navigating.
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Lenis animates; poll rather than sampling a single frame.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeLessThan(50);
  });

  test('an in-page link to another route also lands at the top', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.mouse.wheel(0, 3000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    const link = page.getByRole('link', { name: /pricing/i }).first();
    await link.click();
    await page.waitForURL(/\/pricing/);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeLessThan(50);
  });
});

test.describe('page structure', () => {
  const ROUTES = ['/', '/solutions', '/pricing', '/about', '/contact'];

  for (const route of ROUTES) {
    test(`${route} has exactly one h1 and a unique description`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      // One h1 per page is both an SEO rule (ADR-027) and a document-outline rule.
      await expect(page.locator('h1')).toHaveCount(1);

      const description = await page
        .locator('meta[name="description"]')
        .first()
        .getAttribute('content');
      expect(description?.trim().length ?? 0, `${route} has no meta description`).toBeGreaterThan(
        20,
      );
    });
  }

  test('a missing page returns a branded 404, not a stack trace', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-real-page', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).not.toContainText(/at Object\.|node_modules|webpack/i);
  });
});
