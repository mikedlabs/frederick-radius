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
  },
});
