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
};

export default config;
