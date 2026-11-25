import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import GuideHeader from "./GuideHeader";

const meta = {
  title: "Guides/Guide header",
  component: GuideHeader,
  args: { title: "Live music", parent: "All events", href: "/events", detail: "Friday, December 4" },
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof GuideHeader>;
export default meta;

export const FixedDestination: StoryObj<typeof meta> = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "Live music" })).toBeVisible();
    const parent = canvas.getByRole("link", { name: "All events" });
    await expect(parent).toHaveAttribute("href", "/events");
    await expect(parent.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
