import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — the E2E / browser level of the Nirogix test pyramid.
 *
 * Unit, integration and API levels all run in vitest (see hms_backend and packages/*). This
 * layer exists only for what a browser is genuinely needed to prove: a real multi-role
 * journey across five separate frontends, cross-app session behaviour, route guards as the
 * user meets them, viewport/theme behaviour, and scroll-restoration regressions.
 *
 * Hosts come from resources/domains.md — never hard-coded anywhere but here, and every one is
 * overridable so the same suite runs against local dev, staging, or a preview deployment.
 */

const PORTAL = process.env.E2E_PORTAL_URL ?? 'http://localhost:3001';
const MARKETING = process.env.E2E_MARKETING_URL ?? 'http://localhost:3000';
const PATIENT = process.env.E2E_PATIENT_URL ?? 'http://localhost:3002';
const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:3003';
const AIPORTAL = process.env.E2E_AIPORTAL_URL ?? 'http://localhost:3004';

/** True when pointing at a deployed environment: never start local servers for those. */
const isRemote = Boolean(process.env.E2E_BASE_ENV && process.env.E2E_BASE_ENV !== 'development');

export default defineConfig({
  testDir: './e2e',
  // A hospital journey is inherently ordered; parallel workers would fight over the same
  // seeded tenant. Files run in parallel, tests inside a file stay ordered.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Staging sits behind Nginx basic auth (BACKLOG I-5); supply it rather than skipping.
    httpCredentials:
      process.env.E2E_BASIC_AUTH_USER && process.env.E2E_BASIC_AUTH_PASS
        ? { username: process.env.E2E_BASIC_AUTH_USER, password: process.env.E2E_BASIC_AUTH_PASS }
        : undefined,
  },

  projects: [
    {
      name: 'portal',
      use: { ...devices['Desktop Chrome'], baseURL: PORTAL },
      testMatch: /portal\/.*\.spec\.ts/,
    },
    {
      name: 'marketing',
      use: { ...devices['Desktop Chrome'], baseURL: MARKETING },
      testMatch: /marketing\/.*\.spec\.ts/,
    },
    {
      name: 'apps-smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /smoke\/.*\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], baseURL: PORTAL },
      testMatch: /mobile\/.*\.spec\.ts/,
    },
  ],

  // Local runs boot the whole monorepo through turbo; a deployed target starts nothing.
  webServer: isRemote
    ? undefined
    : {
        command: 'npm run dev',
        url: PORTAL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});

export const APPS = { PORTAL, MARKETING, PATIENT, ADMIN, AIPORTAL };
