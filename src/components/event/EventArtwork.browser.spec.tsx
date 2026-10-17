// @vitest-environment jsdom
import { act, createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventCardVisual } from "./eventVisuals";

const imageCallbacks = vi.hoisted(() => new Map<string, Pick<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad">>());
// Keep image lifecycle events under test control; no publisher requests are
// made by this jsdom test and the fixture does not represent a real event.
vi.mock("next/image", async () => {
  const { useLayoutEffect } = await import("react");
  return { default: function ImageTransport({ src, alt, className, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) {
    useLayoutEffect(() => { if (typeof src === "string") imageCallbacks.set(src, { onLoad, onError }); }, [src, onLoad, onError]);
    return createElement("img", { src, alt, className, onLoad, onError });
  } };
});
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ present, children }: { present: boolean; children: (dismiss: () => void) => ReactNode }) => present ? <section role="dialog">{children(() => {})}</section> : null,
  SheetHandle: () => <button>Close</button>,
}));
vi.mock("@/components/saved/ItineraryButton", () => ({ default: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock("@/components/event/EventActions", () => ({ default: () => null }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));

import EventArtwork from "./EventArtwork";
import EventPosterCard from "./EventPosterCard";
import EventSheet from "./EventSheet";
import EventCard from "./EventCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const visual: EventCardVisual = {
  src: "https://s1.ticketm.net/dam/a/component-artwork.jpg",
  key: "component-artwork",
  caption: "Event image · Ticketmaster",
  presentation: "artwork",
  sourceHref: "https://publisher.example/component-event",
};
const event = {
  slug: "component-event", title: "Community arts afternoon", description: "Demonstration fixture.",
  starts_at: "2029-10-10T14:00:00-04:00", ends_at: "2029-10-10T16:00:00-04:00", timezone: "America/New_York",
  venue_name: "Community hall", address: "Frederick County, Maryland", municipality: "frederick", municipality_name: "Frederick",
  category: "arts", category_name: "Arts & culture", audience: [], is_free: true, source: "ticketmaster", is_verified: false,
  source_id: "component", source_url: visual.sourceHref, license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2029-10-01T12:00:00Z", last_verified_at: "2029-10-01T12:00:00Z", geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area",
  hero_image: visual.src, ticket_url: "https://publisher.example/tickets",
} as EventWithMeta;

describe("publisher event artwork lifecycle", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    imageCallbacks.clear();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it("removes failed artwork and its source credit, and recovers for a new image identity", () => {
    const unavailable = vi.fn();
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(visual.src)!;
    expect(host.querySelector("a")?.href).toBe(visual.sourceHref);
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(unavailable).toHaveBeenCalledOnce();
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();

    const next = { ...visual, src: "https://s1.ticketm.net/dam/a/second-component-artwork.jpg", key: "second-component-artwork" };
    act(() => root.render(<EventArtwork visual={next} onUnavailable={unavailable} />));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(next.src);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    const newImage = host.querySelector("img")!;
    act(() => oldCallbacks.onError?.({ currentTarget: oldImage } as Parameters<NonNullable<typeof oldCallbacks.onError>>[0]));
    expect(host.querySelector("img")).toBe(newImage);
    act(() => newImage.dispatchEvent(new Event("error")));
    act(() => oldCallbacks.onError?.({ currentTarget: oldImage } as Parameters<NonNullable<typeof oldCallbacks.onError>>[0]));
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
  });

  it("rejects a successful one-pixel failure response instead of leaving an empty credited panel", () => {
    act(() => root.render(<EventArtwork visual={visual} />));
    const image = host.querySelector("img")!;
    Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("figure")).toBeNull();
    expect(host.textContent).not.toContain("Ticketmaster");
  });

  it("falls back to the real event date and cancellation after a publisher image fails", () => {
    act(() => root.render(<EventPosterCard event={{ ...event, status: "cancelled" }} />));
    expect(host.querySelector('[data-event-poster="artwork"]')).not.toBeNull();
    const artwork = host.querySelector("figure")!;
    const title = host.querySelector('a[href="/events/component-event"]')!;
    expect(artwork.contains(title)).toBe(false);
    expect(artwork.textContent).not.toContain("Cancelled");
    expect(host.querySelector("article [data-event-photo-credit]")).toBeNull();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector('[data-event-fallback="date-category"]')).not.toBeNull();
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.textContent).toContain("Community arts afternoon");
    expect(host.textContent).toContain("Cancelled");
    expect(host.textContent).toContain("OCT");
    expect(host.textContent).toContain("10");
  });

  it("keeps the sheet title, published time and attendance action ahead of supplementary artwork", () => {
    act(() => root.render(<EventSheet event={event} onClose={() => {}} historyLayerId="component-event" />));
    const title = host.querySelector("h2")!;
    const art = host.querySelector("[data-event-artwork]")!;
    const tickets = host.querySelector('a[href="https://publisher.example/tickets"]')!;
    expect(title.textContent).toBe(event.title);
    expect(art.contains(title)).toBe(false);
    expect(title.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tickets.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).toContain("2:00");
    expect(host.querySelector("img")?.className).toBe("object-contain p-3");
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe(event.title);
    expect(host.querySelector('a[href="https://publisher.example/tickets"]')).not.toBeNull();
  });

  it("keeps exact owned venue photographs in the sheet's photographic treatment", () => {
    act(() => root.render(<EventSheet event={{ ...event, source: "manual", hero_image: undefined, venue_place_slug: "baker-park-bandshell" }} onClose={() => {}} historyLayerId="component-event" />));
    expect(host.querySelector("[data-event-artwork]")).toBeNull();
    expect(host.querySelector("img")?.className).toBe("object-cover");
    expect(host.querySelector("h2")?.textContent).toBe(event.title);
    expect(host.textContent).toContain("Venue · Baker Park Bandshell");
  });

  it("collapses a failed glance thumbnail and its credit while retaining the event's facts and link", () => {
    act(() => root.render(<EventCard event={event} variant="glance" />));
    const eventLink = host.querySelector('a[href="/events/component-event"]')!;
    expect(host.querySelector("figure")).not.toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.querySelector('a[href="/events/component-event"]')).toBe(eventLink);
    expect(host.querySelector("h3")?.textContent).toBe(event.title);
    expect(host.textContent).toContain("2:00");
    expect(host.textContent).toContain("Community hall");
  });

  it("uses a bounded detectable venue-photo failure signal and removes its orphaned credit", () => {
    const venue = { ...event, source: "manual", hero_image: "/api/place-photo?name=component-venue&w=800", hero_image_attribution: {
      kind: "venue", venue_name: "Component venue", provider: "google_maps", source_uri: "https://www.google.com/maps/place/component-venue-photo",
      authors: [{ display_name: "Component author", uri: "https://maps.google.com/maps/contrib/component" }],
    } } as EventWithMeta;
    act(() => root.render(<EventCard event={venue} variant="glance" />));
    const image = host.querySelector("img")!;
    const src = new URL(image.getAttribute("src")!, "https://radius.test");
    expect(src.searchParams.get("w")).toBe("264");
    expect(src.searchParams.get("fallback")).toBe("signal");
    expect(host.textContent).toContain("Component author");
    expect(host.querySelector('a[href="/events/component-event"]')!.contains(host.querySelector("[data-event-photo-credit]"))).toBe(false);
    Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.textContent).not.toContain("Component author");
    expect(host.querySelector("h3")?.textContent).toBe(event.title);
  });

  it("ignores old glance error and one-pixel callbacks after recycling, without resurrecting a newer failed image", () => {
    act(() => root.render(<EventCard event={event} variant="glance" />));
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(visual.src)!;
    const second = { ...event, slug: "second-component-event", title: "Second event", hero_image: "https://s1.ticketm.net/dam/a/second-component-artwork.jpg" };
    act(() => root.render(<EventCard event={second} variant="glance" />));
    const newImage = host.querySelector("img")!;
    expect(newImage).not.toBe(oldImage);
    Object.defineProperties(oldImage, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    const staleEvent = { currentTarget: oldImage } as Parameters<NonNullable<typeof oldCallbacks.onLoad>>[0];
    act(() => { oldCallbacks.onError?.(staleEvent); oldCallbacks.onLoad?.(staleEvent); });
    expect(host.querySelector("img")).toBe(newImage);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    expect(host.querySelector("h3")?.textContent).toBe(second.title);

    act(() => newImage.dispatchEvent(new Event("error")));
    act(() => oldCallbacks.onError?.(staleEvent));
    expect(host.querySelector("figure")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    const third = { ...second, hero_image: "https://s1.ticketm.net/dam/a/third-component-artwork.jpg" };
    act(() => root.render(<EventCard event={third} variant="glance" />));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(third.hero_image);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
  });
});
