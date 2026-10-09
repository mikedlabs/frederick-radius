import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "./PlaceCard";

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
  google_photo_url: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
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
export const PhotographLedGrid: Story = { args: { variant: "grid" } };
export const MapRow: Story = { args: { variant: "row", neutral: true } };
export const WithoutPhotography: Story = { args: { place: { ...place, google_photo_url: undefined } } };
export const FailedPhotograph: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = canvasElement.querySelector("[data-place-card-photo] img");
    if (!image) throw new Error("The real place-photo face is missing.");
    image.dispatchEvent(new Event("error"));
    await expect(canvas.getByRole("button", { name: /View Carroll Creek Linear Park/ })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Carroll Creek Linear Park" })).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull());
  },
};
