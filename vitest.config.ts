import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const storybookMode =
  process.env.RADIUS_STORYBOOK_TEST === "1" ||
  Boolean(process.env.STORYBOOK_CONFIG_DIR);

/**
 * Vitest is the unit runner for new code (P0 remediation onward).
 *
 * Scope note: the existing tests/*.test.ts files use the Node built-in
 * test runner (node:test) and are kept on the `test:node` script. Vitest
 * collects *.spec.ts and *.spec.tsx so the two runners do not collide while
 * React component contracts remain part of the normal verification gate.
 */
export default defineConfig({
  ...(storybookMode
    ? {
        // Storybook's browser runner imports these CommonJS packages through
        // ESM. Vite 7 must pre-bundle them before Chromium loads the stories.
        // Keep this list beside the aria-query override in package.json.
        optimizeDeps: {
          include: ["aria-query", "lz-string", "pretty-format"],
        },
      }
    : {}),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is Next's guard against importing server-side
      // code into a Client Component. It throws when imported from
      // any non-server build. In vitest's Node environment we ARE on
      // the server, so the guard is meaningless — alias it to a stub
      // so integration specs can import server actions directly.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: storybookMode
    ? {
        // Keep the browser project opt-in. Plain `vitest run` is used by data
        // workflows that should not need Chromium or load Storybook plugins.
        projects: [
          {
            extends: true,
            plugins: [
              storybookTest({
                configDir: path.join(dirname, ".storybook"),
                storybookScript: "npm run storybook",
              }),
            ],
            test: {
              name: "storybook",
              browser: {
                enabled: true,
                headless: true,
                provider: playwright({}),
                instances: [{ browser: "chromium" }],
              },
            },
          },
        ],
      }
    : {
        environment: "node",
        include: ["src/**/*.spec.{ts,tsx}", "tests/**/*.spec.{ts,tsx}"],
        exclude: ["node_modules", ".next", "e2e/**"],
        // 20s, up from the 5s default. This is a FLAKE fix, not a slow-test
        // accommodation: a family of specs that decorate the full 1,568-place
        // catalog (daypartPicks, wlr-automotive-search, public-places,
        // google-photo-compliance, workflow-data-contract) sits at 1-2s on an
        // idle machine and blows straight past 5s whenever the host is CPU-
        // starved — parallel agent workloads locally, a busy shared runner in
        // CI. Diagnosed 2026-08-19: five different specs failed under load and
        // every one passed solo, and the identical suite went green the moment
        // the machine went quiet. An intermittently red `verify` gates every
        // merge INCLUDING the nightly data PR, which is how the county's hours
        // went dark in August, so a false red here is far more expensive than
        // the extra 15 seconds a genuine hang now takes to surface.
        testTimeout: 20_000,
      },
});
