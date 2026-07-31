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
const PRODUCTION_SERVER = process.env.PW_PRODUCTION === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Production sends `upgrade-insecure-requests`, which is correct on the
    // HTTPS deployment but makes a local HTTP production server upgrade its
    // own CSS/JS requests to unavailable HTTPS. Browser tests bypass CSP so
    // mobile layout checks exercise the built styles instead of raw HTML.
    // Security-header behavior is covered separately at the HTTP boundary.
    bypassCSP: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Sandboxed/CI environments with a preinstalled Chromium that doesn't
        // match this Playwright version's expected revision can point at it
        // explicitly (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome).
        // Unset on normal machines, where `npx playwright install chromium` rules.
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } }
          : {}),
      },
    },
    // Opt in so normal CI does not suddenly run the whole suite twice.
    // This project exercises the map with Safari's engine, touch input, and
    // an iPhone viewport whenever its gesture model changes.
    ...(process.env.PW_WEBKIT === "1"
      ? [
          {
            name: "webkit-mobile",
            use: {
              ...devices["iPhone 13"],
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: PRODUCTION_SERVER
      ? `npm run start -- -p ${PORT}`
      : `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && !PRODUCTION_SERVER,
    timeout: 120_000,
  },
});
