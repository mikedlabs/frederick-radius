import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";

/**
 * Frederick Radius component workshop.
 *
 * The workshop intentionally uses the Next/Vite framework rather than a
 * second application shell. That keeps next/image, next/link, App Router
 * navigation mocks, path aliases, PostCSS, and the production public assets
 * aligned with the real app while keeping Storybook out of the production
 * bundle.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "@storybook/addon-mcp",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  docs: {
    defaultName: "Notes",
  },
  core: {
    disableTelemetry: true,
  },
  async viteFinal(viteConfig) {
    // The installed workshop framework still supplies parentCacheNode, while
    // Next16.4 reads parentRenderTree before rendering a story. Keep its actual
    // boundary/hooks and adapt only that legacy provider value. Verified with
    // Next16.4.2/Storybook10.5.10; current render-tree contexts pass through and
    // unexpected shapes fail the bridge's actual context checks and tests.
    const aliases = viteConfig.resolve?.alias ?? [];
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = [
      { find: /^next\/dist\/client\/components\/redirect-boundary\.js$/, replacement: fileURLToPath(new URL("./next-router-boundary.tsx", import.meta.url)) },
      ...(Array.isArray(aliases) ? aliases : Object.entries(aliases).map(([find, replacement]) => ({ find, replacement }))),
    ];
    // Canonical Sheet stories are the first workshop surface to exercise the
    // production Framer portal. Pre-bundle both dependencies up front so a
    // clean CI cache does not reload Vitest midway through its first run.
    viteConfig.optimizeDeps ??= {};
    viteConfig.optimizeDeps.include = [
      ...(viteConfig.optimizeDeps.include ?? []).filter((entry) => entry !== "next/dist/client/components/redirect-boundary.js"),
      // The wrapper's real-package import needs normal CJS interop. Keep it
      // separate from the bare framework import that resolves to the bridge.
      "next/dist/client/components/redirect-boundary",
      "next/dist/shared/lib/segment-cache/segment-value-encoding.js",
      "framer-motion",
      "react-dom",
    ];
    return viteConfig;
  },
};

export default config;
