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
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "tests/**/*.spec.ts"],
    exclude: ["node_modules", ".next", "e2e/**"],
  },
});
