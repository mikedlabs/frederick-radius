import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TrustChip from "./TrustChip";

const meta = {
  title: "Primitives/Trust chip",
  component: TrustChip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    docs: {
      description: {
        component:
          "The trust label names where a fact comes from. It labels a source rather than reporting a live state, so it is plain small text with a level dot: no capsule, border or fill. Detail surfaces add the basis as a second line.",
      },
    },
  },
  args: {
    signal: {
      level: "verified",
      label: "Official source",
      basis: "Listed on the organizer's own calendar.",
      checked: "Checked 2 days ago",
    },
  },
} satisfies Meta<typeof TrustChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText("Official source");
    await expect(label).toBeVisible();
    await expect(label).toHaveAttribute("data-trust-label");
    const style = getComputedStyle(label);
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.borderTopWidth).toBe("0px");
    await expect(style.borderTopLeftRadius).toBe("0px");
  },
};

export const Detail: Story = {
  args: { detail: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Official source")).toBeVisible();
    await expect(canvas.getByText(/Listed on the organizer's own calendar\./)).toBeVisible();
  },
};
