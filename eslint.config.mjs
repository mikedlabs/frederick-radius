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
    // Generated MapLibre style and glyph metadata are build artifacts, not
    // authored source. Linting them created more than a thousand false warnings.
    "public/basemap/**",
    // Bundled third-party viewer output; lint its authored source, not Webpack.
    "public/fair-viewer-assets/**",
    "scripts/scratch/**",
    "hud_project/**",
    "patch_briefing.ts",
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
  // Bundle-leak guard: client components must never VALUE-import the big
  // data loaders. loaders/places statically imports the ~12MB enrichment;
  // loaders/events and loaders/places-client statically import the 1.8MB
  // places-client.json. One value import from a "use client" file inlines
  // that data into the client bundle (the EventCard/eventDateBlock leak,
  // caught at 1.8MB on live /events). Type-only imports are erased at build
  // and stay allowed; pure helpers live in data-free modules (e.g.
  // lib/events/format). Server files under src/app are unaffected.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/loaders/events",
              message: "Client components: import types only (import type {...}); values from @/lib/events/format. A value import drags places-client.json (1.8MB) into the bundle.",
              allowTypeImports: true,
            },
            {
              name: "@/lib/loaders/places",
              message: "Client components: import types only. A value import drags the ~12MB enrichment into the bundle (see AppMap.tsx).",
              allowTypeImports: true,
            },
            {
              name: "@/lib/loaders/places-client",
              message: "Client components: use the dynamic-import hook (useClientPlaces) so the 1.8MB dataset loads as a cached lazy chunk, not the main bundle.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
