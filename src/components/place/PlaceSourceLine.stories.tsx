import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceSourceLine from "./PlaceSourceLine";

const now = Date.now();
// Provenance shaped like Wag's Restaurant: a community record checked at its
// source, matched on Google, with a listing check about six months old.
const checked = {
  slug: "story-checked-restaurant", name: "Demonstration restaurant", source: "dfp", is_verified: true,
  google_verified: true, hours_source: "google_places",
  last_verified_at: new Date(now - 175 * 86_400_000).toISOString(), updated_at: "2026-05-14",
} as unknown as PlaceCardData;
// Shaped like Baker Park: a Radius-reviewed record.
const reviewed = { ...checked, slug: "story-reviewed-park", name: "Demonstration park", source: "seed" } as unknown as PlaceCardData;

const meta = {
  title: "Places/Source line",
  component: PlaceSourceLine,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-[min(24rem,calc(100vw-32px))]"><Story /></div>],
  args: { place: checked },
} satisfies Meta<typeof PlaceSourceLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CheckedAtSource: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Checked at source")).toBeVisible();
    await expect(canvas.getByText("Confirmed by Google")).toBeVisible();
    // The listing check and, on a different day, the record's own update,
    // each labeled as what it dates.
    await expect(await canvas.findByText(/^Listing last checked /)).toBeVisible();
    await expect(canvas.getByText(/^Updated on /)).toBeVisible();
    const doc = canvasElement.ownerDocument;
    const root = doc.documentElement;
    const fontSize = root.style.getPropertyValue("font-size");
    try {
      root.style.setProperty("font-size", "200%");
      await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(doc.defaultView!.innerWidth + 1);
    } finally {
      if (fontSize) root.style.setProperty("font-size", fontSize);
      else root.style.removeProperty("font-size");
    }
  },
};

export const ReviewedWithCorrection: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: {
    place: reviewed,
    children: <span>See something wrong? <a className="tap-44-y underline" href="mailto:hello@frederickradius.app">Tell us</a></span>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Radius reviewed")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Tell us" })).toBeVisible();
  },
};

export const UpdatedWithoutCheck: Story = {
  args: { place: { ...checked, last_verified_at: undefined } as unknown as PlaceCardData },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Updated on May 14")).toBeVisible();
  },
};
