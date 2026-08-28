import { expect, type Page } from '@playwright/test';
import { account, type RoleKey } from './accounts';

/**
 * Sign-in through the real form — the same path a user takes, so a broken login page fails
 * the suite rather than being bypassed by injected tokens. Selectors are accessible ones
 * (`getByLabel` / `getByRole`), which also means a regression that breaks the label/input
 * association fails here instead of silently degrading assistive technology.
 */
export async function signIn(page: Page, role: RoleKey): Promise<void> {
  const who = account(role);
  await page.goto('/login');
  await page.getByLabel('Organization code').fill(who.orgCode);
  await page.getByLabel('Email').fill(who.email);
  // Exact: PasswordField's visibility toggle is labelled "Show password"/"Hide password",
  // which a substring match would also select.
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Landing on any authenticated route is the success signal; the dashboard decides which.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export async function signOut(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: /account|profile|menu/i }).first();
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole('menuitem', { name: /sign out|log out/i }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

/**
 * Console errors are collected rather than asserted inline so a spec can state exactly which
 * page produced them. Next.js dev emits hydration/HMR noise that is not a product defect, so
 * the known-benign patterns are filtered — deliberately narrow, not a blanket ignore.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const benign = [
    /Download the React DevTools/i,
    /\[Fast Refresh\]/i,
    /Warning: Extra attributes from the server/i,
    /favicon\.ico/i,
  ];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (benign.some((p) => p.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}
