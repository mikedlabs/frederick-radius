import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest is the unit runner for new code (P0 remediation onward).
 *
 * Scope note: the existing tests/*.test.ts files use the Node built-in
 * test runner (node:test) and are kept on the `test:node` script. Vitest
 * only collects *.spec.ts so the two runners do not collide. New unit
 * tests are written as *.spec.ts.
 */
export default defineConfig({
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
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "tests/**/*.spec.ts"],
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
