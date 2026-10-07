import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn(), venue: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...await importOriginal<typeof import("next/navigation")>(), redirect: mocks.redirect }));
vi.mock("@/lib/loaders/eventResolver", () => ({ resolveEventPageBySlug: mocks.resolve, resolveEventMetadataBySlug: vi.fn(), isOperationalEventResolutionError: () => false }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaceBySlug: mocks.venue, clientPlaces: () => [] }));
vi.mock("@/lib/loaders/eventSaves", () => ({ eventSaveCount: async () => null }));
vi.mock("@/lib/loaders/eventNearbyPlaces", () => ({ loadEventNearbyPlaces: async () => ({ food: [], parking: [], source: "catalog-fallback" }) }));
vi.mock("@/lib/loaders/eventRelated", () => ({ loadRelatedEventSections: async () => ({ lineup: [], moreUpcoming: { title: "More events", items: [] } }) }));
import EventPage from "./page";
const now = new Date("2026-10-06T12:00:00-04:00");
const event: EventWithMeta = { slug: "current-concert", title: "Evening concert", description: "A public concert.", starts_at: "2026-10-06T19:00:00-04:00", ends_at: "2026-10-06T22:00:00-04:00", timezone: "America/New_York", venue_name: "Weinberg Center", venue_place_slug: "venue", address: "20 W Patrick Street", geom: { lng: -77.4126, lat: 39.4142 }, municipality: "frederick", category: "music", audience: [], is_free: false, source: "manual", source_url: "https://example.org/concert", source_id: "42", license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), is_verified: true, category_name: "Music", municipality_name: "Frederick", placement: "venue", geo_confidence: "venue_match" };
function hasVisitEntry(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasVisitEntry);
  if (!isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node)) return false;
  return node.props["aria-label"] === "Plan this visit" || hasVisitEntry(node.props.children);
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ kind: "live", event });
  mocks.venue.mockReturnValue({ slug: "venue", geom: event.geom, is_operational: "operational" });
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`Redirect:${href}`); });
});
afterEach(() => vi.useRealTimers());
describe("event detail planner entry", () => {
  it("keeps a listing origin through canonicalization of a live alias", async () => {
    const origin = "/events?in=frederick&cat=music";
    await expect(EventPage({ params: Promise.resolve({ slug: "old-concert" }), searchParams: Promise.resolve({ returnTo: origin }) })).rejects.toThrow("Redirect:");
    expect(mocks.redirect).toHaveBeenCalledWith(`/events/current-concert?returnTo=${encodeURIComponent(origin)}`);
  });
  it("does not carry an external return on an alias redirect", async () => {
    await expect(EventPage({ params: Promise.resolve({ slug: "old-concert" }), searchParams: Promise.resolve({ returnTo: "https://evil.example/events" }) })).rejects.toThrow("Redirect:");
    expect(mocks.redirect).toHaveBeenCalledWith("/events/current-concert");
  });
  it.each(["closed_permanently", "closed_temporarily"])("withholds the CTA for a %s resolved venue", async (is_operational) => {
    mocks.venue.mockReturnValue({ slug: "venue", geom: event.geom, is_operational });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(hasVisitEntry(page)).toBe(false);
  });
  it("offers the CTA for the same event at an operational venue", async () => {
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(hasVisitEntry(page)).toBe(true);
  });
});
