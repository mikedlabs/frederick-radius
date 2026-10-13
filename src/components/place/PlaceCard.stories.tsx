import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "./PlaceCard";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { contrastRatio } from "@/lib/color/brandHue";

const place: PlaceCardData = {
  slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
  category: "outdoors", tags: [], city: "Frederick", municipality: "frederick",
  open_status: { state: "unknown" },
  short_blurb: "", state: "MD", postal_code: "21701", is_verified: false,
  feature_score: 0, source: "manual", updated_at: "2026-09-01",
  source_id: "component-workshop:carroll-creek", source_url: null,
  license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  address: "Carroll Creek, Frederick, MD", geom: { lng: -77.4105, lat: 39.4143 },
};
const meta = {
  title: "Places/Photograph-led card", component: PlaceCard, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(24rem,calc(100vw-32px))]"><Story /></div>],
  args: { place, variant: "answer", showSource: false },
} satisfies Meta<typeof PlaceCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PhotographLedAnswer: Story = {};
export const PhotographLedTile: Story = { args: { variant: "tile" } };

export const TileCategoryReadability: Story = {
  args: { variant: "tile" },
  parameters: {
    a11y: { test: "error" },
    docs: { description: { story: "Checks computed category-label contrast in the runner’s actual native color scheme. The standard component runner uses light mode; the native-OS browser matrix separately exercises dark mode." } },
  },
  play: async ({ canvasElement }) => {
    const label = within(canvasElement).getByText("Parks & trails");
    await expect(label).toBeVisible();
    const owner = canvasElement.ownerDocument;
    const view = owner.defaultView!;
    const nativeScheme = view.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    await expect(view.getComputedStyle(owner.documentElement).getPropertyValue("--app-native-scheme").trim()).toBe(nativeScheme);

    // Resolve actual browser colors, including the translucent light surface,
    // before applying the existing WCAG math. No palette value is hardcoded.
    const sample = owner.createElement("canvas");
    sample.width = sample.height = 1;
    const context = sample.getContext("2d");
    if (!context) throw new Error("Computed contrast requires a canvas context.");
    const ancestors: Element[] = [];
    for (let element: Element | null = label; element; element = element.parentElement) ancestors.unshift(element);
    for (const element of ancestors) {
      const style = view.getComputedStyle(element);
      await expect(style.backgroundImage).toBe("none");
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    const background = context.getImageData(0, 0, 1, 1).data;
    await expect(background[3]).toBe(255);
    context.fillStyle = view.getComputedStyle(label).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = context.getImageData(0, 0, 1, 1).data;
    const ratio = contrastRatio(
      { r: foreground[0], g: foreground[1], b: foreground[2] },
      { r: background[0], g: background[1], b: background[2] },
    );
    await expect(ratio).toBeGreaterThanOrEqual(4.5);
  },
};

export const PhotographLedGrid: Story = { args: { variant: "grid" } };
export const MapRow: Story = { args: { variant: "row", neutral: true } };
export const WithoutPhotography: Story = { args: { place: { ...place, slug: "place-without-photography", google_photo_url: undefined } } };
export const CuratedLandmark: Story = { args: { place: {
  ...place, slug: "francis-scott-key-grave-and-monument", name: "Francis Scott Key Grave and Monument",
  address: "Mount Olivet Cemetery, Frederick, MD", google_photo_url: undefined,
} } };
export const PreferredCuratedGrid: Story = { args: { variant: "grid", place: {
  ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace", city: "Thurmont",
  address: "Catoctin Furnace, Thurmont, MD", municipality: "thurmont", google_photo_url: undefined,
} } };
export const PublicDomainCredit: Story = { args: { variant: "tile", place: {
  ...place, slug: "historic-roddy-road-covered-bridge-thurmont", name: "Roddy Road Covered Bridge", city: "Thurmont",
  address: "Roddy Road, Thurmont, MD", municipality: "thurmont", google_photo_url: undefined,
} } };
export const FailedPhotograph: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvasElement.querySelector("[data-place-card-photo] img");
    if (!image) throw new Error("The real place-photo face is missing.");
    image.dispatchEvent(new Event("error"));
    const metadata = getLandmarkPhoto(place.slug)!;
    await waitFor(() => expect(canvasElement.querySelector("[data-place-card-photo] img")?.getAttribute("alt")).toBe(metadata.alt));
    const curatedImage = canvasElement.querySelector("[data-place-card-photo] img");
    if (!curatedImage) throw new Error("The exact curated fallback is missing.");
    curatedImage.dispatchEvent(new Event("error"));
    await expect(canvas.getByRole("button", { name: /View Carroll Creek Linear Park/ })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Carroll Creek Linear Park" })).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull());
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
  },
};
