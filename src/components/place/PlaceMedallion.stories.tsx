import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { PlaceMedallion } from "./PlaceMedallion";

const meta = {
  title: "Places/Compact owned photo",
  component: PlaceMedallion,
  parameters: { layout: "centered" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { place: { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", category: "park" }, size: 32, shape: "circle" },
  render: (args) => <a href={`/places/${args.place.slug}`} className="flex min-h-[44px] items-center gap-3" style={{ maxWidth: 260 }}>
    <PlaceMedallion {...args} /><span>{args.place.name}</span>
  </a>,
} satisfies Meta<typeof PlaceMedallion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedCreekWithoutMetadata: Story = {
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector<HTMLImageElement>("img")!;
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(new URL(image.currentSrc).searchParams.get("url") ?? decodeURIComponent(new URL(image.currentSrc).pathname))
      .toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    await waitFor(() => expect(canvasElement.querySelector("[data-photo-state]")).toHaveAttribute("data-photo-state", "ready"));
    await expect(within(canvasElement).getByRole("link", { name: "Carroll Creek Linear Park" })).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
    await expect(canvasElement.querySelector("a a")).toBeNull();
  },
};
export const FailedOwnedKeepsDestination: Story = {
  play: async ({ canvasElement }) => {
    // Explicitly model media failure; the real local success is exercised above.
    canvasElement.querySelector("img")!.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull());
    await expect(canvasElement.querySelector("[data-place-media]")).toHaveAttribute("data-place-media", "fallback");
    await expect(within(canvasElement).getByRole("link", { name: "Carroll Creek Linear Park" })).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
    await expect(canvasElement.querySelector("svg")).not.toBeNull();
  },
};
export const NoUncreditedLicensedLockup: Story = {
  args: { place: { slug: "new-market-historic-district-new-market", name: "New Market Historic District", category: "antiques" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(within(canvasElement).getByRole("link", { name: "New Market Historic District" })).toHaveAttribute("href", "/places/new-market-historic-district-new-market");
  },
};
