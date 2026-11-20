import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import MapNearbyPanel from "./MapNearbyPanel";
import type { MapPinPlace } from "./types";

const playgroundCenter = { lng: -77.4505009, lat: 39.4066899 };
const playground: MapPinPlace = {
  slug: "sophie-madigans-playground-frederick", name: "Sophie & Madigan's Playground",
  category: "playground", subcategories: [], geom: playgroundCenter, municipality: "frederick",
  source: "manual", is_verified: false, short_blurb: "", open_status: { state: "unknown" },
};
const localShops = Array.from({ length: 5 }, (_, index): MapPinPlace => ({
  ...playground, slug: `fixture-shop-${index}`, name: `Sample shop ${index + 1}`,
  category: "coffee", geom: { ...playgroundCenter, lng: playgroundCenter.lng + .001 * (index + 1) },
}));
const district: MapPinPlace = {
  ...playground, slug: "new-market-historic-district-new-market", name: "New Market Historic District",
  category: "antiques", municipality: "new-market", geom: { lat: 39.3828, lng: -77.2694 },
};
const meta = {
  title: "Map/Nearby panel",
  component: MapNearbyPanel,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/map" style={{ width: "min(38rem, calc(100vw - 24px))" }}><Story /></div>],
  args: { places: [...localShops, playground], sortOrigin: playgroundCenter, userLoc: null, expanded: false, onPick: fn(), onExpandedChange: fn() },
  render: function Preview(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return <MapNearbyPanel {...args} expanded={expanded} onExpandedChange={setExpanded} />;
  },
} satisfies Meta<typeof MapNearbyPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedPhotoAndMorePlaces: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const lead = canvas.getByRole("button", { name: playground.name });
    const media = lead.querySelector<HTMLElement>("[data-map-nearby-media]")!;
    const img = media.querySelector("img")!;
    await img.decode();
    await expect(img.naturalWidth).toBeGreaterThan(1);
    await waitFor(() => expect(media).toHaveAttribute("data-photo-state", "ready"));
    await expect(lead).toHaveAccessibleDescription(/from map center/);
    await expect(canvasElement.querySelectorAll("[data-map-nearby-place]")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "All 6 places in this view" }));
    await expect(canvasElement.querySelectorAll("[data-map-nearby-place]")).toHaveLength(5);
    await userEvent.click(canvas.getByRole("button", { name: "Show 1 more" }));
    await expect(Array.from(canvasElement.querySelectorAll("[data-map-nearby-place]"), row => row.getAttribute("data-map-nearby-place")))
      .toEqual([playground.slug, ...localShops.map(p => p.slug)]);
    await userEvent.click(canvas.getByRole("button", { name: "Less, collapse nearby places" }));
    await expect(canvasElement.querySelectorAll("[data-map-nearby-place]")).toHaveLength(1);
    const owner = canvasElement.ownerDocument;
    await owner.fonts.ready;
    const measure = async () => {
      const win = owner.defaultView!;
      await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
      return [lead, media, lead.querySelector("[data-map-nearby-name]")!, canvasElement.querySelector("[data-map-nearby-toggle]")!].map(node => {
        const { width, height } = node.getBoundingClientRect();
        return { width, height };
      });
    };
    const before = await measure();
    img.dispatchEvent(new Event("error"));
    await waitFor(() => expect(media).toHaveAttribute("data-photo-state", "fallback"));
    await expect(lead).toHaveAttribute("data-has-photo-plan", "true");
    await expect(media.querySelector("img")).toBeNull();
    await expect(lead).toHaveAccessibleName(playground.name);
    const after = await measure();
    for (const [index, previous] of before.entries()) {
      await expect(after[index].height, JSON.stringify({ before, after })).toBeCloseTo(previous.height, 0);
      await expect(after[index].width, JSON.stringify({ before, after })).toBeCloseTo(previous.width, 0);
    }
    await userEvent.click(lead);
    await expect(args.onPick).toHaveBeenCalledWith(playground);
    await expect(lead).toHaveFocus();
  },
};

export const FeaturedPhotoOutsideFirstPage: Story = {
  args: { places: [...localShops, district], sortOrigin: localShops[0].geom, userLoc: localShops[0].geom },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const featured = canvas.getByRole("button", { name: district.name });
    await expect(featured).toHaveAccessibleDescription(/from you/);
    await userEvent.click(canvas.getByRole("button", { name: "All 6 places in this view" }));
    const slugs = () => Array.from(canvasElement.querySelectorAll("[data-map-nearby-place]"), row => row.getAttribute("data-map-nearby-place"));
    await expect(slugs()).toEqual(localShops.map(p => p.slug));
    const closest = canvas.getByRole("button", { name: localShops[0].name });
    await expect(closest.querySelector("[data-map-nearby-media]")).toHaveAttribute("data-photo-state", "fallback");
    await userEvent.click(canvas.getByRole("button", { name: "Show 1 more" }));
    await expect(slugs()).toEqual([...localShops.map(p => p.slug), district.slug]);
    await userEvent.click(canvas.getByRole("button", { name: "Less, collapse nearby places" }));
    await expect(canvas.getByRole("button", { name: "All 6 places in this view" })).toHaveFocus();
    await expect(slugs()).toEqual([district.slug]);
  },
};

export const NoReviewedPhotos: Story = {
  args: { places: localShops },
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const lead = within(canvasElement).getByRole("button", { name: localShops[0].name });
    await expect(lead.querySelector("[data-map-nearby-media]")).toHaveAttribute("data-photo-state", "fallback");
    await expect(canvasElement.querySelector("img")).toBeNull();
    await userEvent.click(lead);
    await expect(args.onPick).toHaveBeenCalledWith(localShops[0]);
  },
};

export const EmptyView: Story = {
  args: { places: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-map-nearby-panel]")).toBeNull();
  },
};

const carillon: MapPinPlace = {
  ...playground, slug: "joseph-dill-baker-memorial-carillon-bell-tower", name: "Joseph Dill Baker Memorial Carillon Bell Tower",
  category: "civic", geom: { lng: -77.4161324, lat: 39.4156826 },
};
export const VisibleNamesForVoiceControl: Story = {
  args: { places: [carillon, ...Array.from({ length: 1000 }, (_, index) => ({
    ...localShops[0], slug: `voice-fixture-${index}`, name: `Sample shop ${index + 1}`,
  }))], sortOrigin: carillon.geom },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lead = canvas.getByRole("button", { name: `Baker Park Carillon, ${carillon.name}` });
    await expect(lead.querySelector("[data-map-nearby-name]")).toHaveTextContent("Baker Park Carillon");
    const toggle = canvas.getByRole("button", { name: "All 1,001 places in this view" });
    await expect(toggle).toHaveTextContent("All 1,001");
    await userEvent.click(toggle);
    await expect(toggle).toHaveTextContent("Less");
    await expect(toggle).toHaveAccessibleName("Less, collapse nearby places");
  },
};

export const LicensedImageAndCredit: Story = {
  args: { places: [district, playground], sortOrigin: district.geom },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lead = canvas.getByRole("button", { name: district.name });
    const image = lead.querySelector("img")!;
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    // The short shared credit: the author as text, then license and source links.
    await waitFor(() => expect(canvas.getByRole("link", { name: "Wikimedia Commons" }))
      .toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:New_Market_HD_MD1.jpg"));
    await expect(canvasElement.querySelector("[data-photo-credit-author]")).toHaveTextContent("Acroterion");
    await expect(canvas.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(canvasElement.querySelector("button a, a button")).toBeNull();
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvas.queryByRole("link", { name: /Wikimedia Commons/i })).toBeNull());
    await expect(lead).toHaveAccessibleName(district.name);
  },
};
