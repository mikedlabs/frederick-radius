// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ present, children }: { present: boolean; children: (dismiss: () => void) => ReactNode }) =>
    present ? <>{children(() => {})}</> : null,
  SheetHandle: () => null,
}));
vi.mock("@/components/saved/ItineraryButton", () => ({ default: () => null }));
vi.mock("@/components/event/EventActions", () => ({ default: () => null }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));

import EventSheet from "./EventSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const event = {
  slug: "bluegrass-jam",
  title: "Bluegrass Jam",
  description: "",
  starts_at: "2026-10-08T23:00:00.000Z",
  ends_at: "2026-10-09T01:00:00.000Z",
  timezone: "America/New_York",
  venue_name: "Steinhardt Brewing Company",
  address: "340 E Patrick St, Frederick, MD",
  geom: { lng: -77.4, lat: 39.41 },
  municipality: "frederick",
  category: "music",
  audience: [],
  is_free: true,
  source: "manual",
  is_verified: true,
  geo_confidence: "venue_match",
  category_name: "Music",
  municipality_name: "Frederick",
  last_verified_at: "2026-10-07T12:00:00.000Z",
  hero_image: "/api/place-photo?name=places%2Fsteinhardt%2Fphotos%2Fone&w=800",
  hero_image_attribution: {
    kind: "venue",
    venue_name: "Steinhardt Brewing Company",
    provider: "google_maps",
    source_uri: "https://www.google.com/maps/place/steinhardt",
    authors: [{ display_name: "A H", uri: "https://maps.google.com/maps/contrib/1" }],
  },
} as unknown as EventWithMeta;

async function settle(img: HTMLImageElement, outcome: "photo" | "signal") {
  await act(async () => {
    const size = outcome === "photo" ? 1200 : 1;
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size },
      naturalHeight: { configurable: true, value: size },
    });
    img.dispatchEvent(new Event("load"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("EventSheet hero photo", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(<EventSheet event={event} onClose={() => {}} historyLayerId="event-sheet-test" />),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const heroImg = () =>
    container.querySelector<HTMLImageElement>('[data-event-sheet-hero="photo"] img');
  const credit = () => container.querySelector("[data-event-photo-credit]");

  it("withholds the venue credit until the photo decodes", async () => {
    expect(heroImg()?.getAttribute("src")).toContain("fallback=signal");
    expect(credit()).toBeNull();

    await settle(heroImg()!, "photo");

    expect(credit()?.textContent).toContain("Photo by A H");
  });

  it("opens on the photoless header with no credit when the proxy signals failure", async () => {
    await settle(heroImg()!, "signal");

    expect(container.querySelector("[data-event-sheet-hero]")).toBeNull();
    expect(credit()).toBeNull();
    expect(container.querySelector("header h2")?.textContent).toBe("Bluegrass Jam");
  });
});

describe("EventSheet for a venue with no car access", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    // Saturday morning of Colorfest, before the show opens.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T08:00:00-04:00"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const colorfest = {
      ...event,
      slug: "catoctin-colorfest-thurmont-2026",
      title: "Catoctin Colorfest",
      starts_at: "2026-10-10T13:00:00.000Z",
      ends_at: "2026-10-11T21:00:00.000Z",
      venue_name: "Thurmont Community Park",
      venue_place_slug: "thurmont-community-park-thurmont",
      address: "19 Frederick Rd, Thurmont, MD 21788",
      geom: { lng: -77.4127594, lat: 39.6213 },
      hero_image: undefined,
      hero_image_attribution: undefined,
    } as unknown as EventWithMeta;
    await act(async () =>
      root.render(<EventSheet event={colorfest} onClose={() => {}} historyLayerId="event-sheet-colorfest" />),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("offers the guide's parking and shuttle section instead of a driving route", () => {
    const parking = container.querySelector<HTMLAnchorElement>("[data-event-parking-action]");
    expect(parking?.getAttribute("href")).toBe("/moments/catoctin-colorfest-2026#getting-there");
    expect(parking?.textContent).toContain("Parking and shuttle");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("google.com/maps/dir"))).toBe(false);
    expect(container.textContent).not.toContain("See garage");
  });
});
