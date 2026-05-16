import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright covers the critical user paths required by the remediation
 * spec: event times render correctly, radius results match the polygon,
 * search returns expected results, dedup is enforced.
 *
 * Next refuses a second `next dev` per project, so Playwright reuses an
 * already-running dev server (the local preview server on 3010) and only
 * spawns its own when none is running (CI). Browser binaries install once
 * with `npx playwright install chromium` (CI installs them in the runner).
 */
const PORT = Number(process.env.PW_PORT) || 3010;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
