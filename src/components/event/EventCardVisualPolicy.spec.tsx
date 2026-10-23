// @vitest-environment jsdom
import { act, createElement, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

// The real card, resolver, credit and image lifecycle remain mounted. Only
// Next's image transport is a native image; this test never calls a provider.
vi.mock("next/image", () => ({ default: ({ src, alt, className, style, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) =>
  createElement("img", { src, alt, className, style, onLoad, onError }) }));
import EventCard from "./EventCard";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const candidate: EventWithMeta = {
  slug: "offline-preview-policy", title: "Offline preview policy fixture", description: "Fictional event.",
  starts_at: "2029-10-10T19:00:00-04:00", ends_at: "2029-10-10T21:00:00-04:00", timezone: "America/New_York",
  venue_name: "Fixture Hall", address: "", municipality: "frederick", municipality_name: "Frederick",
  category: "music", category_name: "Music", audience: [], is_free: false, price_text: "$10 published admission",
  source: "manual", is_verified: false, source_id: "offline-preview-policy", source_url: "https://example.test/events/offline-preview-policy",
  license: "Offline test fixture", confidence: "curated", first_seen_at: "2029-10-10T12:00:00Z", last_verified_at: "2029-10-10T12:00:00Z",
  geom: { lat: 39.4, lng: -77.4 }, geo_confidence: "area",
  hero_image: "/api/place-photo?name=places%2Foffline%2Fphotos%2Fpolicy-fixture",
  hero_image_attribution: { kind: "venue", venue_name: "Fixture Hall", provider: "google_maps", source_uri: "https://maps.google.com/?cid=offline-fixture", authors: [] },
};
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  request = vi.fn<typeof fetch>().mockRejectedValue(new Error("Provider requests are forbidden in this fixture"));
  vi.stubGlobal("fetch", request);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

function render(event = candidate, venuePhotos?: "all-approved" | "free-reviewed", variant: "glance" | "discovery" = "glance") {
  act(() => root.render(<EventCard event={event} variant={variant} venuePhotos={venuePhotos} nowISO="2029-10-10T16:00:00-04:00" />));
}
function factsSurvive() {
  expect(host.querySelector('a[href="/events/offline-preview-policy"]')).not.toBeNull();
  expect(host.textContent).toContain(candidate.title);
  expect(host.textContent).toContain("7:00");
  expect(host.textContent).toContain("$10 published admission");
  expect(request).not.toHaveBeenCalled();
}

describe("bounded event preview photo policy", () => {
  it("omits the Google proxy image and credit when a new preview requests reviewed free media", () => {
    render(candidate, "free-reviewed");
    expect(host.querySelector("img")).toBeNull();
    expect(host.innerHTML).not.toContain("/api/place-photo");
    expect(host.querySelector("[data-event-photo-credit]")).toBeNull();
    factsSurvive();
  });

  it("keeps the existing default policy and removes its proxy immediately when switched to free media", () => {
    render();
    expect(host.querySelector("img")?.getAttribute("src")).toMatch(/^\/api\/place-photo\?/);
    expect(host.querySelector("[data-event-photo-credit]")).not.toBeNull();
    render(candidate, "free-reviewed");
    expect(host.querySelector("img")).toBeNull();
    expect(host.innerHTML).not.toContain("/api/place-photo");
    factsSurvive();
  });

  it("shows the exact bundled venue image with free media rather than its paid candidate", () => {
    render({ ...candidate, venue_name: "Baker Park", venue_place_slug: "baker-park-frederick" }, "free-reviewed");
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/images/places/baker-park-detail.jpg");
    expect(host.innerHTML).not.toContain("/api/place-photo");
    expect(host.textContent).toContain("Venue · Baker Park");
    factsSurvive();
  });
});


describe("photo-forward discovery card contracts", () => {
  const owned = { ...candidate, venue_name: "Baker Park", venue_place_slug: "baker-park-frederick" };

  it("keeps a useful media-free card rather than activating a paid venue photo", () => {
    render(candidate, "all-approved", "discovery");
    expect(host.querySelector('[data-event-card-layout="discovery"]')).not.toBeNull();
    expect(host.querySelector('[data-event-media="none"]')).not.toBeNull();
    expect(host.querySelector("figure, img")).toBeNull();
    expect(host.innerHTML).not.toContain("/api/place-photo");
    factsSurvive();
  });

  it("places the exact approved venue image ahead of complete independent facts and credit", () => {
    render(owned, "free-reviewed", "discovery");
    const link = host.querySelector('a[href="/events/offline-preview-policy"]')!;
    const figure = host.querySelector("figure")!;
    expect(host.querySelector('[data-event-media="photo"]')).not.toBeNull();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/images/places/baker-park-detail.jpg");
    expect(figure.compareDocumentPosition(host.querySelector("h3")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(figure.textContent).not.toContain(candidate.title);
    expect(link.textContent).toContain("Baker Park");
    expect(link.contains(host.querySelector("[data-event-photo-credit]"))).toBe(false);
    expect(host.textContent).toContain("Venue · Baker Park");
    expect(host.querySelector("a a, button a")).toBeNull();
    factsSurvive();
  });

  it("gives a long discovery title its own heading row and prints the complete date only with timing", () => {
    const title = "Fictional community performance, artist conversation and neighborhood gathering at Baker Park";
    render({ ...owned, title }, "free-reviewed", "discovery");
    const heading = host.querySelector("[data-event-card-heading]")!;
    expect(heading.querySelector("h3")?.textContent).toBe(title);
    expect(heading.querySelector("h3")?.parentElement).toBe(heading);
    expect(heading.textContent).not.toContain("OCT");
    expect(host.querySelector("[data-event-card-time]")?.textContent).toBe("Wed OCT 10 · 7:00 PM–9:00 PM");
    expect(host.querySelectorAll("[data-event-card-time]")).toHaveLength(1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/images/places/baker-park-detail.jpg");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { label: "all-day", patch: { is_all_day: true }, expected: "Wed OCT 10 · All day" },
    { label: "unknown end", patch: { ends_at: candidate.starts_at }, expected: "Wed OCT 10 · 7:00 PM · end time not listed" },
    { label: "cancelled", patch: { status: "cancelled" as const }, expected: "Wed OCT 10 · 7:00 PM–9:00 PM" },
    { label: "postponed", patch: { status: "postponed" as const }, expected: "Wed OCT 10 · 7:00 PM–9:00 PM" },
  ])("retains exact discovery timing for $label events without a live claim", ({ patch, expected }) => {
    render({ ...owned, ...patch }, "free-reviewed", "discovery");
    expect(host.querySelector("[data-event-card-time]")?.textContent).toBe(expected);
    if (patch.status) expect(host.textContent).toContain(patch.status === "cancelled" ? "Cancelled" : "Postponed");
    expect(host.textContent).not.toContain("Happening now");
    expect(host.querySelector(".live-dot")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps approved publisher artwork source-specific and outside the factual open-event target", () => {
    render({ ...candidate, source: "dfp", hero_image: "https://ik.imagekit.io/vibemap/offline-publisher-layout.jpg",
      source_url: "https://downtownfrederick.org/vm-event/offline-publisher-layout/", hero_image_attribution: undefined }, "free-reviewed", "discovery");
    expect(host.querySelector('[data-event-media="artwork"]')).not.toBeNull();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("https://ik.imagekit.io/vibemap/offline-publisher-layout.jpg");
    const credit = host.querySelector("[data-event-photo-credit]")!;
    expect(credit.textContent).toContain("Event image · Downtown Frederick Partnership");
    expect(credit.querySelector("a")?.getAttribute("href")).toBe("https://downtownfrederick.org/vm-event/offline-publisher-layout/");
    expect(host.querySelector('a[href="/events/offline-preview-policy"]')?.contains(credit)).toBe(false);
    factsSurvive();
  });

  it("keeps all archival license facts and real credit links separate from the event action", () => {
    render({ ...candidate, venue_name: "Brewer's Alley", venue_place_slug: "brewers-alley-frederick" }, "free-reviewed", "discovery");
    const credit = host.querySelector("[data-event-licensed-credit]")!;
    const image = CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"].image;
    expect(credit.textContent).toContain("photographed in 2004");
    expect(credit.textContent).toContain(image.creator);
    expect(credit.textContent).toContain(image.modifications);
    expect(credit.querySelector(`a[href="${image.source_url}"]`)).not.toBeNull();
    expect(credit.querySelector(`a[href="${image.license.url}"]`)).not.toBeNull();
    expect(host.querySelector('a[href="/events/offline-preview-policy"]')?.contains(credit)).toBe(false);
    factsSurvive();
  });

  it.each(["error", "one-pixel"] as const)("collapses unavailable %s media and its credit without changing the factual link", failure => {
    render(owned, "free-reviewed", "discovery");
    const link = host.querySelector('a[href="/events/offline-preview-policy"]');
    const image = host.querySelector("img")!;
    if (failure === "one-pixel") Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    act(() => image.dispatchEvent(new Event(failure === "error" ? "error" : "load")));
    expect(host.querySelector('[data-event-media="none"]')).not.toBeNull();
    expect(host.querySelector("figure, img, [data-event-photo-credit]")).toBeNull();
    expect(host.querySelector('a[href="/events/offline-preview-policy"]')).toBe(link);
    factsSurvive();
  });

  it("retains cancellation and honest unknown-end copy without a live claim", () => {
    act(() => root.render(<EventCard event={{ ...owned, status: "cancelled", ends_at: owned.starts_at }}
      variant="discovery" live nowISO="2029-10-10T20:00:00-04:00" />));
    expect(host.textContent).toContain("Cancelled");
    expect(host.textContent).toContain("end time not listed");
    expect(host.textContent).not.toContain("Happening now");
    expect(host.querySelector(".live-dot")).toBeNull();
    expect(host.textContent).toContain(candidate.title);
    expect(request).not.toHaveBeenCalled();
  });
});
