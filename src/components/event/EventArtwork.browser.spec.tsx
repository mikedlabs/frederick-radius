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
import TonightHeadline from "@/components/today/TonightHeadline";
import { TodayEventsRecoveryView } from "@/components/today/TodayEventsRecovery";

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


describe("Today approved media lifecycle", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    imageCallbacks.clear();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it.each(["publisher", "owned"] as const)("keeps the headline and event action after %s media fails, with no orphaned credit", (kind) => {
    const row = kind === "publisher" ? event : { ...event, source: "manual" as const,
      hero_image: undefined, venue_place_slug: "baker-park-frederick" };
    act(() => root.render(<TonightHeadline event={row} now={new Date("2029-10-10T12:00:00-04:00")} embedded />));
    const link = host.querySelector('a[href="/events/component-event"]')!;
    const title = host.querySelector("h3")!;
    expect(title.textContent).toBe(event.title);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    expect(link.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.querySelector("a a")).toBeNull();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.querySelector('a[href="/events/component-event"]')).toBe(link);
    expect(host.querySelector("h3")).toBe(title);
    expect(host.textContent).toContain("View event");
    expect(host.textContent).toContain("2:00");
    expect(host.textContent).toContain("Community hall");
  });

  it("rejects a one-pixel headline photograph and ignores stale callbacks after a different visual is displayed", () => {
    const first = { ...event, source: "manual" as const, hero_image: undefined, venue_place_slug: "baker-park-frederick" };
    const next = { ...first, venue_place_slug: "carroll-creek-linear-park-frederick" };
    act(() => root.render(<TonightHeadline event={first} now={new Date("2029-10-10T12:00:00-04:00")} embedded />));
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get("/images/seasons/fall/018.jpg")!;
    act(() => root.render(<TonightHeadline event={next} now={new Date("2029-10-10T12:00:00-04:00")} embedded />));
    const image = host.querySelector("img")!;
    act(() => oldCallbacks.onError?.({ currentTarget: oldImage } as Parameters<NonNullable<typeof oldCallbacks.onError>>[0]));
    expect(host.querySelector("img")).toBe(image);
    expect(host.textContent).toContain("Venue · Carroll Creek Linear Park");
    Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    act(() => oldCallbacks.onError?.({ currentTarget: oldImage } as Parameters<NonNullable<typeof oldCallbacks.onError>>[0]));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain(event.title);
  });

  it("retains the recovered pick after a failed approved thumbnail and removes its credit", () => {
    const pick = { slug: event.slug, title: event.title, presenter: "Fixture presenter", venue: event.venue_name,
      municipality: "frederick", time: "2:00 PM", moment: "Later" as const, image: null, free: true,
      visual: { src: "/images/seasons/fall/018.jpg", key: "radius-baker-park-bandshell",
        caption: "Venue · Baker Park", presentation: "photo" as const } };
    act(() => root.render(<TodayEventsRecoveryView response={{ events: [pick], partial: false }} />));
    const link = host.querySelector('a[href="/events/component-event"]')!;
    expect(host.querySelector("article")?.getAttribute("data-decision-surface")).toBe("today");
    expect(host.querySelector("img")).not.toBeNull();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.querySelector('a[href="/events/component-event"]')).toBe(link);
    expect(host.textContent).toContain("Fixture presenter: Community arts afternoon");
    expect(host.textContent).toContain("2:00 PM");
    expect(host.textContent).toContain("Community hall · Free");
  });

  it("requests the detectable failure response for an already-approved headline venue photo", () => {
    const row = { ...event, source: "manual", hero_image: "/api/place-photo?name=component-venue&w=800",
      hero_image_attribution: { kind: "venue", venue_name: "Component venue", provider: "google_maps",
        source_uri: "https://www.google.com/maps/place/component-venue-photo",
        authors: [{ display_name: "Component author", uri: "https://maps.google.com/maps/contrib/component" }] } } as EventWithMeta;
    act(() => root.render(<TonightHeadline event={row} now={new Date("2029-10-10T12:00:00-04:00")} embedded />));
    const image = host.querySelector("img")!;
    const src = new URL(image.getAttribute("src")!, "https://radius.test");
    expect(src.searchParams.get("fallback")).toBe("signal");
    expect(src.searchParams.get("name")).toBe("component-venue");
    expect(host.textContent).toContain("Component author");
    Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(host.textContent).not.toContain("Component author");
    expect(host.textContent).toContain(event.title);
  });

  it.each(["artwork", "glance", "headline"] as const)("ignores an abandoned A request after A to B to A on %s", (surface) => {
    const render = (src: string) => {
      if (surface === "artwork") return <EventArtwork visual={{ ...visual, src }} />;
      const row = { ...event, hero_image: src };
      return surface === "glance" ? <EventCard event={row} variant="glance" />
        : <TonightHeadline event={row} now={new Date("2029-10-10T12:00:00-04:00")} embedded />;
    };
    act(() => root.render(render(visual.src)));
    const abandonedImage = host.querySelector("img")!;
    const abandoned = imageCallbacks.get(visual.src)!;
    act(() => root.render(render("https://s1.ticketm.net/dam/a/intermediate-b.jpg")));
    act(() => root.render(render(visual.src)));
    const current = host.querySelector("img")!;
    expect(current).not.toBe(abandonedImage);
    act(() => abandoned.onError?.({ currentTarget: abandonedImage } as Parameters<NonNullable<typeof abandoned.onError>>[0]));
    expect(host.querySelector("img")).toBe(current);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    act(() => current.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
  });


  type PrematureSurface = "artwork" | "glance" | "headline-art" | "headline-photo" | "recovery";
  const prematureSurfaces: PrematureSurface[] = ["artwork", "glance", "headline-art", "headline-photo", "recovery"];
  function renderPrematureSurface(surface: PrematureSurface) {
    if (surface === "artwork") return <EventArtwork visual={visual} />;
    if (surface === "glance") return <EventCard event={event} variant="glance" />;
    if (surface === "headline-art") return <TonightHeadline event={event} now={new Date("2029-10-10T12:00:00-04:00")} embedded />;
    if (surface === "headline-photo") return <TonightHeadline event={{ ...event, source: "manual", hero_image: undefined, venue_place_slug: "baker-park-frederick" }} now={new Date("2029-10-10T12:00:00-04:00")} embedded />;
    return <TodayEventsRecoveryView response={{ partial: false, events: [{
      slug: event.slug, title: event.title, venue: event.venue_name, municipality: "frederick",
      time: "2:00 PM", moment: "Later", image: null, free: true,
      visual: { ...visual, key: "event:" + visual.src },
    }] }} />;
  }
  function imageState(image: HTMLImageElement, width: number, height: number, currentSrc: string) {
    Object.defineProperties(image, {
      naturalWidth: { value: width, configurable: true },
      naturalHeight: { value: height, configurable: true },
      currentSrc: { value: currentSrc, configurable: true },
      complete: { value: true, configurable: true },
    });
  }
  function prematureSyntheticLoad(image: HTMLImageElement) {
    imageState(image, 0, 0, "");
    const callbacks = imageCallbacks.get(image.getAttribute("src")!)!;
    expect(callbacks.onLoad).toBeTypeOf("function");
    // Mirrors the diagnosed Next callback: complete=true but no selected src
    // or decoded pixels yet. This is not the browser's eventual native load.
    act(() => callbacks.onLoad?.({ currentTarget: image } as Parameters<NonNullable<typeof callbacks.onLoad>>[0]));
  }

  it.each(prematureSurfaces)("keeps %s media and credit through premature zero dimensions until genuine loaded pixels", (surface) => {
    act(() => root.render(renderPrematureSurface(surface)));
    const image = host.querySelector("img")!;
    prematureSyntheticLoad(image);
    expect(host.querySelector("img")).toBe(image);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    imageState(image, 600, 900, image.src);
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("img")).toBe(image);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
  });

  it("rejects a completed selected zero-dimension response after native load and notifies once", () => {
    const unavailable = vi.fn();
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const image = host.querySelector("img")!;
    const add = vi.spyOn(image, "addEventListener"), remove = vi.spyOn(image, "removeEventListener");
    prematureSyntheticLoad(image);
    expect(host.querySelector("img")).toBe(image);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    expect(unavailable).not.toHaveBeenCalled();
    const load = add.mock.calls.find(([name]) => name === "load")?.[1];
    const error = add.mock.calls.find(([name]) => name === "error")?.[1];
    expect(load).toBeTypeOf("function");
    expect(error).toBeTypeOf("function");
    // Real DPR3 one-pixel transport can round density-adjusted natural sizes
    // to zero. The selected source and completion distinguish it from the
    // earlier Next callback, whose currentSrc was still empty.
    imageState(image, 0, 0, visual.src + "?w=384&q=75");
    act(() => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("load", load);
    expect(remove).toHaveBeenCalledWith("error", error);
    act(() => {
      image.dispatchEvent(new Event("load"));
      image.dispatchEvent(new Event("error"));
    });
    expect(unavailable).toHaveBeenCalledOnce();
  });

  it.each(["one-pixel load", "native error"] as const)("accepts %s after a premature callback once, removing artwork and credit", (settlement) => {
    const unavailable = vi.fn();
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const image = host.querySelector("img")!;
    prematureSyntheticLoad(image);
    expect(host.querySelector("img")).toBe(image);
    expect(unavailable).not.toHaveBeenCalled();
    if (settlement === "one-pixel load") imageState(image, 1, 1, image.src);
    act(() => image.dispatchEvent(new Event(settlement === "one-pixel load" ? "load" : "error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(unavailable).toHaveBeenCalledOnce();
    act(() => {
      image.dispatchEvent(new Event("load"));
      image.dispatchEvent(new Event("error"));
    });
    expect(unavailable).toHaveBeenCalledOnce();
  });

  it("detaches pending native listeners after successful settlement without altering the selected source", () => {
    act(() => root.render(<EventArtwork visual={visual} />));
    const image = host.querySelector("img")!;
    const add = vi.spyOn(image, "addEventListener"), remove = vi.spyOn(image, "removeEventListener");
    prematureSyntheticLoad(image);
    const load = add.mock.calls.find(([name]) => name === "load")?.[1];
    const error = add.mock.calls.find(([name]) => name === "error")?.[1];
    expect(load).toBeTypeOf("function");
    expect(error).toBeTypeOf("function");
    imageState(image, 600, 900, image.src);
    act(() => image.dispatchEvent(new Event("load")));
    expect(remove).toHaveBeenCalledWith("load", load);
    expect(remove).toHaveBeenCalledWith("error", error);
    expect(host.querySelector("img")).toBe(image);
    expect(image.getAttribute("src")).toBe(visual.src);
  });

  it("detaches abandoned pending listeners across A to B to A and ignores the old element's native failure", () => {
    const unavailable = vi.fn();
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const oldImage = host.querySelector("img")!;
    const add = vi.spyOn(oldImage, "addEventListener"), remove = vi.spyOn(oldImage, "removeEventListener");
    prematureSyntheticLoad(oldImage);
    const load = add.mock.calls.find(([name]) => name === "load")?.[1];
    const error = add.mock.calls.find(([name]) => name === "error")?.[1];
    expect(load).toBeTypeOf("function");
    expect(error).toBeTypeOf("function");
    const next = { ...visual, key: "intermediate", src: "https://s1.ticketm.net/dam/a/intermediate-native.jpg" };
    act(() => root.render(<EventArtwork visual={next} onUnavailable={unavailable} />));
    expect(remove).toHaveBeenCalledWith("load", load);
    expect(remove).toHaveBeenCalledWith("error", error);
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const current = host.querySelector("img")!;
    expect(current).not.toBe(oldImage);
    imageState(oldImage, 1, 1, oldImage.src);
    act(() => {
      oldImage.dispatchEvent(new Event("load"));
      oldImage.dispatchEvent(new Event("error"));
    });
    expect(host.querySelector("img")).toBe(current);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    expect(unavailable).not.toHaveBeenCalled();
  });

  it("detaches pending listeners on unmount and ignores later native events", () => {
    const unavailable = vi.fn();
    act(() => root.render(<EventArtwork visual={visual} onUnavailable={unavailable} />));
    const image = host.querySelector("img")!;
    const add = vi.spyOn(image, "addEventListener"), remove = vi.spyOn(image, "removeEventListener");
    prematureSyntheticLoad(image);
    const load = add.mock.calls.find(([name]) => name === "load")?.[1];
    const error = add.mock.calls.find(([name]) => name === "error")?.[1];
    expect(load).toBeTypeOf("function");
    expect(error).toBeTypeOf("function");
    act(() => root.render(null));
    expect(remove).toHaveBeenCalledWith("load", load);
    expect(remove).toHaveBeenCalledWith("error", error);
    act(() => image.dispatchEvent(new Event("error")));
    expect(host.childElementCount).toBe(0);
    expect(unavailable).not.toHaveBeenCalled();
  });

});
