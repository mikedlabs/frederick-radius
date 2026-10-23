import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "./EventCard";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

const sample = {
  slug: "story-concert", title: "Community concert at Memorial Park", description: "",
  starts_at: "2026-09-10T18:00:00-04:00", ends_at: "2026-09-10T20:00:00-04:00",
  timezone: "America/New_York", address: "Memorial Park, Thurmont, MD", venue_name: "Memorial Park", municipality: "thurmont",
  municipality_name: "Thurmont", category: "music", category_name: "Music",
  audience: [], is_free: true, source: "manual", is_verified: false,
  source_id: "story", source_url: null, license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  geom: { lng: -77.4, lat: 39.62 }, geo_confidence: "area",
} as EventWithMeta;

const meta = {
  title: "Events/Decision card", component: EventCard, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(42rem,calc(100vw-24px))]"><Story /></div>],
  args: { event: sample, variant: "feature", nowISO: "2026-09-10T12:00:00-04:00" },
} satisfies Meta<typeof EventCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoPhotography: Story = {};
export const CountyComparison: Story = { args: { variant: "compact" } };
export const MissingEndAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { event: { ...sample, ends_at: sample.starts_at }, variant: "glance" },
};
export const Online: Story = { args: { event: { ...sample, attendance_mode: "online" }, variant: "glance" } };
export const PrimaryTabRows: Story = {
  decorators: [(Story) => <div data-app-primary-tab="/events"><Story /></div>],
  args: { variant: "glance" },
};
export const PrimaryTabLiveLead: Story = {
  decorators: [(Story) => <div data-app-primary-tab="/events"><Story /></div>],
  args: { variant: "feature", live: true, nowISO: "2026-09-10T19:00:00-04:00" },
};

export const ApprovedVenuePhotograph: Story = {
  decorators: [(Story) => <div data-app-primary-tab="/events"><Story /></div>],
  args: {
    variant: "glance",
    event: { ...sample, title: "Demonstration concert at Baker Park", venue_name: "Baker Park", venue_place_slug: "baker-park-frederick", municipality: "frederick", municipality_name: "Frederick" },
  },
};


export const FreeReviewedPreviewWithoutPaidPhoto: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { variant: "glance", venuePhotos: "free-reviewed", event: {
    ...sample, hero_image: "/api/place-photo?name=places%2Foffline%2Fphotos%2Fpolicy-fixture",
    hero_image_attribution: { kind: "venue", venue_name: "Memorial Park", provider: "google_maps", source_uri: "https://maps.google.com/?cid=offline-fixture", authors: [] },
  } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: /Community concert at Memorial Park/ })).toBeVisible();
    expect(canvasElement.querySelector("img")).toBeNull();
    expect(canvasElement.innerHTML).not.toContain("/api/place-photo");
    expect(canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
  },
};

export const FreeReviewedOwnedVenuePreview: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { variant: "glance", venuePhotos: "free-reviewed", event: {
    ...sample, venue_name: "Baker Park", venue_place_slug: "baker-park-frederick", municipality: "frederick", municipality_name: "Frederick",
  } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Venue · Baker Park", { exact: true })).toBeVisible();
    const image = canvasElement.querySelector("img");
    expect(image).not.toBeNull();
    const url = new URL(image!.getAttribute("src")!, document.baseURI);
    expect(url.searchParams.get("url") ?? url.pathname).toBe(getOwnedPlacePhoto("baker-park-frederick")!.src);
    expect(canvasElement.innerHTML).not.toContain("/api/place-photo");
  },
};
