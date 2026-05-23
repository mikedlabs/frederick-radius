import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code worktrees keep their own .next/ build dirs and any
    // stale checkout state. The top-level .next/** pattern doesn't
    // catch nested ones, so 2,000+ phantom errors leak in. Ignore the
    // worktree root entirely — nothing in there is project source.
    ".claude/**",
    // Defensive: catch any *other* nested .next/ that future tools
    // might emit alongside the project tree.
    "**/.next/**",
  ]),
]);

export default eslintConfig;
