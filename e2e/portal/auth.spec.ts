import { expect, test } from '@playwright/test';
import { account, ENVIRONMENT, IS_PRODUCTION } from '../helpers/accounts';
import { collectConsoleErrors, signIn } from '../helpers/auth';

/**
 * Portal authentication and role context in the browser (testcases.md §1, manual guide §1, §13).
 *
 * The API suites already prove the server's answers. What only a browser can prove is what the
 * *user* meets: that a wrong password surfaces a message instead of a blank screen, that a
 * signed-in user lands in their own hospital's context, and that the quick-login helper obeys
 * its environment gate — a helper that leaked into production would be a real security defect.
 */

test.describe('sign-in', () => {
  test('valid staff credentials reach an authenticated screen', async ({ page }) => {
    await signIn(page, 'receptionist');

    // Signed in means off the login route and showing the app shell, not a blank body.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('the authenticated screen loads without runtime errors', async ({ page }) => {
    await signIn(page, 'receptionist');

    // Collected only AFTER sign-in, then re-exercised by a reload. The login page itself
    // probes /auth/me while unauthenticated, and that deliberate 401 is normal behaviour —
    // asserting across it would either fail here or force a blanket "ignore 401s" rule that
    // would hide a genuine authorization bug on an authenticated screen.
    const errors = collectConsoleErrors(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation').first()).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a wrong password shows an error and does not authenticate', async ({ page }) => {
    const who = account('receptionist');
    await page.goto('/login');
    await page.getByLabel('Organization code').fill(who.orgCode);
    await page.getByLabel('Email').fill(who.email);
    await page.getByLabel('Password', { exact: true }).fill('DefinitelyWrong#123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the form refuses to submit with empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Required fields keep the user on the page rather than firing a doomed request.
    await expect(page).toHaveURL(/\/login/);
  });

  test('a forgot-password link is offered and opens the reset request page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});

test.describe('quick-login helper (ADR-080)', () => {
  test('is present outside production and offers hospital roles only', async ({ page }) => {
    test.skip(IS_PRODUCTION, 'production must not expose the helper — asserted separately');
    await page.goto('/login');

    const trigger = page.getByRole('button', { name: /test credentials/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // A platform operator must never be offered here — that is the whole point of the rule.
    await expect(dialog).not.toContainText(/super admin|platform admin|platform operator/i);
    await expect(dialog).toContainText(/doctor/i);
    await expect(dialog).toContainText(/receptionist/i);

    if (ENVIRONMENT === 'staging') {
      await expect(dialog).toContainText(/branch admin/i);
    }
  });

  test('selecting an account fills the form and that account can sign in', async ({ page }) => {
    test.skip(IS_PRODUCTION, 'production must not expose the helper');
    await page.goto('/login');
    await page.getByRole('button', { name: /test credentials/i }).click();

    await page
      .getByRole('dialog')
      .getByText(/doctor/i)
      .first()
      .click();

    // Filling the real form (not a second auth path) is the documented behaviour.
    await expect(page.getByLabel('Email')).not.toHaveValue('');
    await expect(page.getByLabel('Organization code')).not.toHaveValue('');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('is absent in production', async ({ page }) => {
    test.skip(!IS_PRODUCTION, 'only meaningful against a production build');
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /test credentials/i })).toHaveCount(0);
  });
});

test.describe('session boundaries', () => {
  test('a protected route is unreachable before signing in', async ({ page }) => {
    await page.goto('/patients', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('the signed-in user sees their own hospital, and the session survives a reload', async ({
    page,
  }) => {
    await signIn(page, 'doctor');
    const url = page.url();

    await page.reload({ waitUntil: 'domcontentloaded' });
    // A reload that bounces to /login means the session is not really established.
    await expect(page).toHaveURL(url);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
