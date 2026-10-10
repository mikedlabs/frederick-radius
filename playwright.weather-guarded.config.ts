import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import baseConfig from "./playwright.config";

/**
 * Strict unavailable-state browser coverage, separate from the regular suite
 * that accepts every actual resolved weather state. First use the existing
 * `npm run build` promoted snapshot workflow, then run:
 * `npx playwright test --config=playwright.weather-guarded.config.ts`
 *
 * Always start this checkout's production server with the same egress guard
 * used by its build. Never reuse an unguarded dev server on the chosen port.
 */
const PORT = Number(process.env.PW_PORT) || 3196;
const guardUrl = pathToFileURL(resolve(__dirname, "scripts/promoted-build-network-guard.mjs")).href;

export default defineConfig({
  ...baseConfig,
  testMatch: "today-weather-priority.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  metadata: { ...baseConfig.metadata, weatherProviderMode: "guarded-unavailable" },
  use: { ...baseConfig.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      RADIUS_DATA_MODE: "promoted",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${guardUrl}`].filter(Boolean).join(" "),
    },
  },
});
