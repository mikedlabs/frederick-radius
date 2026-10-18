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

function render(event = candidate, venuePhotos?: "all-approved" | "free-reviewed") {
  act(() => root.render(<EventCard event={event} variant="glance" venuePhotos={venuePhotos} nowISO="2029-10-10T16:00:00-04:00" />));
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
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/images/seasons/fall/018.jpg");
    expect(host.innerHTML).not.toContain("/api/place-photo");
    expect(host.textContent).toContain("Venue · Baker Park");
    factsSurvive();
  });
});
