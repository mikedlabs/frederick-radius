import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import AppearanceControl from "./AppearanceControl";

const meta = {
  title: "Navigation/Appearance control", component: AppearanceControl,
  tags: ["autodocs"], parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof AppearanceControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavedAppearance: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: /Switch to (light|dark) appearance/ });
    const before = button.getAttribute("aria-label");
    await userEvent.click(button);
    await expect(button).not.toHaveAccessibleName(before!);
    const owner = canvasElement.ownerDocument;
    const selected = owner.documentElement.dataset.appearance;
    await expect(owner.defaultView!.getComputedStyle(owner.documentElement).getPropertyValue("--app-native-scheme").trim()).toBe(selected);
    await expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(button);
    await expect(button).toHaveAccessibleName(before!);
  },
};
