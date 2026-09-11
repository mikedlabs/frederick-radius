import type { StorybookConfig } from "@storybook/nextjs-vite";

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
    // Canonical Sheet stories are the first workshop surface to exercise the
    // production Framer portal. Pre-bundle both dependencies up front so a
    // clean CI cache does not reload Vitest midway through its first run.
    viteConfig.optimizeDeps ??= {};
    viteConfig.optimizeDeps.include = [
      ...(viteConfig.optimizeDeps.include ?? []),
      "framer-motion",
      "react-dom",
    ];
    return viteConfig;
  },
};

export default config;
