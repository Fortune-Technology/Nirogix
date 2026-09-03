import { expect, test } from '@playwright/test';
import { APPS } from '../../playwright.config';
import { collectConsoleErrors } from '../helpers/auth';

/**
 * Frontend smoke across all five applications (testcases.md §12b FE-*, manual guide §15).
 *
 * Deliberately shallow and deliberately honest: this proves each app boots, serves its own
 * identity, and does not throw — it does **not** claim to test those apps' workflows. Deep
 * behaviour lives in the per-app specs and in the API suites.
 *
 * The four non-marketing apps must also stay out of search results (ADR-027), which is a
 * real product requirement and cheap to assert here.
 */

const SURFACES = [
  { name: 'marketing', url: APPS.MARKETING, indexable: true },
  { name: 'portal', url: APPS.PORTAL, indexable: false },
  { name: 'patient', url: APPS.PATIENT, indexable: false },
  { name: 'admin', url: APPS.ADMIN, indexable: false },
  { name: 'aiportal', url: APPS.AIPORTAL, indexable: false },
] as const;

for (const surface of SURFACES) {
  test.describe(`${surface.name}`, () => {
    test('loads without runtime errors and states its own identity', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const response = await page.goto(surface.url, { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `${surface.name} responded ${response?.status()}`).toBeLessThan(
        400,
      );

      // Every app sets its own <title> (ADR-061); a shared or empty one is a regression.
      const title = await page.title();
      expect(title.trim().length, `${surface.name} has an empty <title>`).toBeGreaterThan(0);
      expect(title).not.toMatch(/create next app/i);

      // The browser-tab icon is the Nirogix mark, never create-next-app scaffolding.
      const favicon = page.locator('link[rel~="icon"]');
      if (await favicon.count()) {
        await expect(favicon.first()).not.toHaveAttribute('href', /vercel|next\.svg/i);
      }

      expect(errors, `${surface.name} console errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test(`is ${surface.indexable ? 'indexable' : 'noindex'}`, async ({ page }) => {
      await page.goto(surface.url, { waitUntil: 'domcontentloaded' });
      const robots = await page
        .locator('meta[name="robots"]')
        .first()
        .getAttribute('content')
        .catch(() => null);

      if (surface.indexable) {
        expect(robots ?? '').not.toMatch(/noindex/i);
      } else {
        // The four product apps must never be indexed — patient and staff surfaces above all.
        expect(robots ?? '', `${surface.name} is missing a noindex robots meta`).toMatch(
          /noindex/i,
        );
      }
    });
  });
}

test.describe('protected routes', () => {
  test('the Portal sends an unauthenticated visitor to sign-in, not to a dashboard', async ({
    page,
  }) => {
    await page.goto(`${APPS.PORTAL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  // The Admin console's dashboard is the root route (app/(app)/page.tsx), not /dashboard —
  // and /tenants is the operator screen that must never be reachable without a session.
  test('the Admin console sends an unauthenticated visitor to sign-in', async ({ page }) => {
    await page.goto(`${APPS.ADMIN}/`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('an Admin operator screen is unreachable without a session', async ({ page }) => {
    await page.goto(`${APPS.ADMIN}/tenants`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('the Admin console offers no quick-login in any environment (ADR-080)', async ({ page }) => {
    await page.goto(`${APPS.ADMIN}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /test credentials/i })).toHaveCount(0);
  });
});
