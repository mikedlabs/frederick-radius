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

/** A row without a picture keeps the picture's slot so titles line up down
 * the list. The category glyph sits in it, muted and unboxed, level with the
 * title's first line. */
export const GlyphSlot390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { variant: "glance" },
  play: async ({ canvasElement }) => {
    const glyph = canvasElement.querySelector<HTMLElement>("[data-event-row-glyph]")!;
    await expect(glyph).not.toBeNull();
    const style = getComputedStyle(glyph);
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.borderTopWidth).toBe("0px");
    await expect(style.borderRadius).toBe("0px");
    await expect(glyph.getBoundingClientRect().width).toBe(64);
    const icon = glyph.querySelector("svg")!.getBoundingClientRect();
    await expect(icon.width).toBe(24);
    const title = canvasElement.querySelector<HTMLElement>("article h3")!;
    const range = document.createRange();
    // Measure the title's text line boxes. Selecting the link would also
    // return the block press face's own box, which spans every line.
    range.selectNodeContents(title.querySelector("a [data-press-face]")!);
    const firstLine = range.getClientRects()[0];
    await expect(Math.abs(icon.top + icon.height / 2 - (firstLine.top + firstLine.height / 2))).toBeLessThanOrEqual(4);
  },
};

/** The legacy tile and itinerary row variants are the same flat row. */
export const LegacyRowWithSave: Story = {
  args: { variant: "row" },
  play: async ({ canvasElement }) => {
    const article = canvasElement.querySelector<HTMLElement>("article")!;
    await expect(getComputedStyle(article).boxShadow).toBe("none");
    await expect(getComputedStyle(article).borderTopWidth).toBe("0px");
    const save = canvasElement.querySelector<HTMLElement>('[data-save-ref="event:story-concert"]')!;
    await expect(save).not.toBeNull();
    // A 36px control whose invisible .tap-44 extender gives it a 44px target.
    await expect(save.classList.contains("tap-44")).toBe(true);
    await expect(save.getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    // It sits above the row link's overlay, so a tap saves instead of opening.
    const box = save.getBoundingClientRect();
    await expect(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest("button")).toBe(save);
  },
};
export const LegacyTile: Story = { args: { variant: "tile" } };

const longVenue = {
  ...sample, title: "Weeknight trivia", venue_name: "JoJo's Restaurant & Tap House",
  address: "16 East Patrick Street, Frederick, MD", municipality: "frederick", municipality_name: "Frederick",
  is_free: false, price_text: "$5 at the door", is_recurring: true, recurrence_text: "Runs most days",
} as EventWithMeta;
const startsWithSeparator = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll("article p, article span")].filter((node) => node.textContent?.trim().startsWith("·"));

/** A long venue keeps its town when the card has room, and recurrence gets
 * a line of its own with no leading separator. */
export const LongVenueWithRecurrence: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  args: { variant: "glance", event: longVenue },
  play: async ({ canvasElement }) => {
    const venue = within(canvasElement).getByText("JoJo's Restaurant & Tap House · Frederick", { exact: true });
    await expect(venue).toBeVisible();
    await expect(venue.getBoundingClientRect().width).toBeGreaterThan(160);
    await expect(venue.scrollWidth).toBeLessThanOrEqual(venue.clientWidth);
    const recurrence = within(canvasElement).getByText("Runs most days", { exact: true });
    await expect(recurrence.tagName).toBe("P");
    await expect(recurrence.getBoundingClientRect().left).toBeCloseTo(venue.closest("div")!.getBoundingClientRect().left, 0);
    expect(startsWithSeparator(canvasElement)).toEqual([]);
  },
};

/** At 320 the same venue is cut inside the card instead of widening it. */
export const LongVenueAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { variant: "glance", event: longVenue },
  play: async ({ canvasElement }) => {
    const venue = within(canvasElement).getByText("JoJo's Restaurant & Tap House · Frederick", { exact: true });
    const card = canvasElement.querySelector("article")!.getBoundingClientRect();
    await expect(venue.getBoundingClientRect().right).toBeLessThanOrEqual(card.right);
    await expect(venue.getBoundingClientRect().width).toBeGreaterThan(160);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(startsWithSeparator(canvasElement)).toEqual([]);
  },
};

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
