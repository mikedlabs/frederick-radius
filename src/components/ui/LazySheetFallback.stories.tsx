import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createRef } from "react";
import { expect, fn } from "storybook/test";
import LazySheetFallback from "./LazySheetFallback";

const meta = {
  title: "Radius UI/Loading detail sheet",
  component: LazySheetFallback,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    label: "Loading event details",
    onClose: fn(),
    onOpenFullPage: fn(),
    returnFocusRef: createRef<HTMLElement>(),
  },
  play: async ({ canvas, args, userEvent }) => {
    const escape = canvas.getByRole("button", { name: "Open full page" });
    await expect(canvas.getByRole("dialog", { name: "Loading event details" })).toBeVisible();
    await expect(escape).toBeVisible();
    await expect(escape.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(escape);
    await expect(args.onOpenFullPage).toHaveBeenCalledTimes(1);
  },
} satisfies Meta<typeof LazySheetFallback>;

export default meta;
type Story = StoryObj<typeof meta>;
export const EventAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } } };
export const EventAt375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } } };
export const EventAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } } };
export const EventAt430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } } };
export const EventDesktop: Story = { globals: { viewport: { value: "radiusDesktop", isRotated: false } } };
export const PlaceLoading: Story = {
  args: { label: "Loading place details", onOpenFullPage: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Loading place details" })).toBeVisible();
    await expect(canvas.getAllByRole("button", { name: "Close" })).toHaveLength(2);
    await expect(canvas.queryByRole("button", { name: "Open full page" })).toBeNull();
  },
};
