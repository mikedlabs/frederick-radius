import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn(), venue: vi.fn(), noStore: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...await importOriginal<typeof import("next/navigation")>(), redirect: mocks.redirect }));
vi.mock("@/lib/loaders/eventResolver", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/loaders/eventResolver")>(), resolveEventPageBySlug: mocks.resolve, resolveEventMetadataBySlug: vi.fn() }));
vi.mock("next/cache", async (importOriginal) => ({ ...await importOriginal<typeof import("next/cache")>(), unstable_noStore: mocks.noStore }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: mocks.captureMessage }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaceBySlug: mocks.venue, clientPlaces: () => [] }));
vi.mock("@/lib/loaders/eventSaves", () => ({ eventSaveCount: async () => null }));
vi.mock("@/lib/loaders/eventNearbyPlaces", () => ({ loadEventNearbyPlaces: async () => ({ food: [], parking: [], source: "catalog-fallback" }) }));
vi.mock("@/lib/loaders/eventRelated", () => ({ loadRelatedEventSections: async () => ({ lineup: [], moreUpcoming: { title: "More events", items: [] } }) }));
import EventPage from "./page";
import { EventResolutionTimeoutError, EventResolutionUnavailableError } from "@/lib/loaders/eventResolver";
const now = new Date("2026-10-06T12:00:00-04:00");
const event: EventWithMeta = { slug: "current-concert", title: "Evening concert", description: "A public concert.", starts_at: "2026-10-06T19:00:00-04:00", ends_at: "2026-10-06T22:00:00-04:00", timezone: "America/New_York", venue_name: "Weinberg Center", venue_place_slug: "venue", address: "20 W Patrick Street", geom: { lng: -77.4126, lat: 39.4142 }, municipality: "frederick", category: "music", audience: [], is_free: false, source: "manual", source_url: "https://example.org/concert", source_id: "42", license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), is_verified: true, category_name: "Music", municipality_name: "Frederick", placement: "venue", geo_confidence: "venue_match" };
function hasVisitEntry(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasVisitEntry);
  if (!isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node)) return false;
  return node.props["aria-label"] === "Plan this visit" || hasVisitEntry(node.props.children);
}
function collectProps(node: ReactNode, visit: (props: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) { node.forEach((child) => collectProps(child, visit)); return; }
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return;
  visit(node.props);
  collectProps(node.props.children, visit);
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

describe("event detail operational recovery rendering", () => {
  it.each([
    ["timeout", () => new EventResolutionTimeoutError(["live"])],
    ["unavailable", () => new EventResolutionUnavailableError(["unified"])],
  ] as const)("renders actual recovery for a recognized %s resolver rejection", async (_kind, makeError) => {
    const failure = makeError();
    mocks.resolve.mockRejectedValue(failure);
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('data-event-recovery="source-unavailable"');
    expect(html).toContain("This event could not be confirmed yet.");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/events"');
    expect(hasVisitEntry(page)).toBe(false);
    expect(mocks.resolve).toHaveBeenCalledWith(event.slug);
    expect(mocks.noStore).toHaveBeenCalledOnce();
    expect(mocks.captureMessage).toHaveBeenCalledWith("event-detail: served source-unavailable recovery", {
      level: "warning",
      tags: { surface: "event-detail", recovery: "source-unavailable" },
      extra: { slug: event.slug, sources: failure.sources },
    });
    expect(mocks.venue).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("propagates an unexpected resolver failure without reporting operational recovery", async () => {
    const failure = new Error("Unexpected render failure");
    mocks.resolve.mockRejectedValue(failure);
    await expect(EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) })).rejects.toBe(failure);
    expect(mocks.noStore).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });
});

describe("event detail arrival for a venue with no car access", () => {
  it("sends Colorfest drivers to parking and offers walking directions only", async () => {
    // The organizer closes Frederick Road and there is no parking at the park
    // during the show (colorfest.org/plan-your-visit, read Oct 8).
    vi.setSystemTime(new Date("2026-10-10T08:30:00-04:00"));
    const colorfest: EventWithMeta = {
      ...event,
      slug: "catoctin-colorfest-thurmont-2026",
      title: "Catoctin Colorfest",
      starts_at: "2026-10-10T09:00:00-04:00",
      ends_at: "2026-10-11T17:00:00-04:00",
      venue_name: "Thurmont Community Park",
      venue_place_slug: "thurmont-community-park-thurmont",
      address: "19 Frederick Rd, Thurmont, MD 21788",
      geom: { lng: -77.4127594, lat: 39.6213 },
      municipality: "thurmont",
      municipality_name: "Thurmont",
      is_free: true,
    };
    mocks.resolve.mockResolvedValue({ kind: "seed", event: colorfest });
    mocks.venue.mockReturnValue({ slug: "thurmont-community-park-thurmont", geom: colorfest.geom, is_operational: "operational" });
    const page = await EventPage({ params: Promise.resolve({ slug: colorfest.slug }), searchParams: Promise.resolve({}) });
    const arrival: string[] = [];
    const hrefs: string[] = [];
    collectProps(page, (props) => {
      if (typeof props["data-event-arrival"] === "string") arrival.push(props["data-event-arrival"]);
      if (typeof props.href === "string") hrefs.push(props.href);
    });
    expect(arrival).toEqual(["catoctin-colorfest-2026"]);
    expect(hrefs).toContain("/moments/catoctin-colorfest-2026#getting-there");
    const directions = hrefs.filter((href) => href.startsWith("https://www.google.com/maps/dir/"));
    expect(directions.length).toBeGreaterThan(0);
    for (const href of directions) expect(href).toContain("travelmode=walking");
  });
});
