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
  // No em dashes in user-facing copy. CLAUDE.md bans them and cleanFeedText
  // strips them from FEED data, but it never sees hand-typed JSX/strings, so
  // they kept leaking into toasts, errors, empty states, and editorial. A prior
  // manual sweep did not hold; this gate makes it stick. Targets JSXText +
  // string literals (NOT comments), in the consumer app only (the /pitch +
  // marketing shell is a separate voice and is exempt). For a legitimate
  // standalone em-dash "no data" glyph, disable per-line with a reason.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/app/pitch/**", "src/components/marketing/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/—/]",
          message: "No em dashes in user-facing copy: use a comma, period, or colon (voice rule; cleanFeedText only cleans feed data, not hand-written JSX).",
        },
        {
          selector: "Literal[value=/—/]",
          message: "No em dashes in user-facing strings: use a comma, period, or colon.",
        },
        {
          selector: "TemplateElement[value.cooked=/—/]",
          message: "No em dashes in user-facing template strings: use a comma, period, or colon.",
        },
      ],
    },
  },
]);

export default eslintConfig;
