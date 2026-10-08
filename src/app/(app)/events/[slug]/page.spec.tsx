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
vi.mock("@/lib/loaders/eventRelated", () => ({ loadRelatedEventSections: async () => ({ lineup: [], sections: [] }) }));
// The pairings card is an async server component that fetches NWS weather, and
// MapReturnLink reads the search params; neither is under test here.
vi.mock("@/components/event/EventSmartPairings", () => ({ default: () => null }));
vi.mock("@/components/place/MapReturnLink", () => ({ default: () => null }));
import EventPage from "./page";
import { EventResolutionTimeoutError, EventResolutionUnavailableError } from "@/lib/loaders/eventResolver";
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

async function renderEvent(target: EventWithMeta, kind: "seed" | "live" = "live"): Promise<string> {
  mocks.resolve.mockResolvedValue({ kind, event: target });
  const page = await EventPage({ params: Promise.resolve({ slug: target.slug }), searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(page);
}

/** The markup from an opening marker to the first closing tag after it. */
function section(html: string, marker: string, closing: string): string {
  const start = html.indexOf(marker);
  expect(start, `expected ${marker} in the page`).toBeGreaterThanOrEqual(0);
  const end = html.indexOf(closing, start);
  return html.slice(start, end);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("event detail picture-first hero", () => {
  it("shows a publisher flyer whole, with no title, gradient or control drawn on it", async () => {
    const flyer: EventWithMeta = {
      ...event,
      slug: "flyer-show",
      source: "dfp",
      hero_image: "https://ik.imagekit.io/dfp/flyer-show.jpg",
      source_url: "https://downtownfrederick.org/events/flyer-show",
    };
    const html = await renderEvent(flyer);
    const figure = section(html, 'data-event-hero="flyer"', "</figure>");
    const frame = section(figure, "data-event-hero-frame", "</div>");
    expect(frame).toContain("object-contain");
    expect(frame).not.toContain("object-cover");
    expect(frame).toContain("aspect-[16/10] max-h-[360px]");
    expect(frame).toContain("var(--app-bg-sunken)");
    for (const drawnOver of ["<h1", "gradient", "<button", "<a "]) {
      expect(figure).not.toContain(drawnOver);
    }
    // The credit waits for the image to load, and the title sits on Cream below.
    expect(figure).not.toContain("data-event-photo-credit");
    expect(count(html, "<h1")).toBe(1);
    expect(html.indexOf("<h1")).toBeGreaterThan(html.indexOf("</figure>"));
    expect(html).toContain('class="display-2 mt-1"');
    // A photo leads, so the venue map stays below and renders once.
    expect(count(html, "data-venue-mini-map=")).toBe(1);
    expect(html).toContain('data-venue-mini-map="inline"');
  });

  it("dresses only Radius's own photo with type, in tokens", async () => {
    mocks.venue.mockReturnValue({ slug: "carroll-creek-linear-park-frederick", geom: event.geom, is_operational: "operational" });
    const html = await renderEvent({ ...event, venue_place_slug: "carroll-creek-linear-park-frederick" });
    const hero = section(html, 'data-event-hero="owned"', "</h1>");
    expect(hero).toContain("object-cover");
    expect(hero).toContain("var(--app-ink-inverse)");
    expect(hero).toContain("<h1");
    expect(hero).not.toMatch(/rgba\(|text-white|from-black/);
    expect(count(html, "<h1")).toBe(1);
  });

  it("opens Colorfest on its park map with the days, Free, and the guide link", async () => {
    mocks.venue.mockReturnValue({ slug: "thurmont-community-park-thurmont", geom: { lng: -77.4127594, lat: 39.6213 }, is_operational: "operational" });
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
      category: "arts",
      category_name: "Arts & culture",
      is_free: true,
      source_url: "https://www.thurmont.com/2236/Colorfest",
    };
    const html = await renderEvent(colorfest, "seed");
    expect(html).toContain('data-event-hero="map"');
    expect(count(html, "data-venue-mini-map=")).toBe(1);
    expect(html).toContain('data-venue-mini-map="hero"');
    expect(html).toContain("Thurmont Community Park, Frederick Rd");
    expect(section(html, 'data-glance-tile="when"', "</div>")).toContain("Sat Oct 10 and Sun Oct 11");
    expect(section(html, 'data-glance-tile="getting-in"', "</div>")).toContain("Free");
    expect(html).toContain('href="/moments/catoctin-colorfest-2026"');
    expect(html).toMatch(/Open the (?:<!-- -->)?Catoctin Colorfest(?:<!-- -->)? guide/);
    expect(count(html, "<h1")).toBe(1);

    // Frederick Road is closed and the park has no parking during the show,
    // so even on the morning of the show Directions is walking only, is never
    // the filled action, and the page points drivers at parking and shuttles.
    vi.setSystemTime(new Date("2026-10-10T08:30:00-04:00"));
    const morning = await renderEvent(colorfest, "seed");
    expect(morning).toContain('data-event-arrival="catoctin-colorfest-2026"');
    expect(morning).toContain('href="/moments/catoctin-colorfest-2026#getting-there"');
    expect(morning).toContain("travelmode=walking");
    expect(morning).not.toMatch(/data-decision-action="directions" data-bar-primary="true"/);

    // After the moment's window closes, the guide link goes with it.
    vi.setSystemTime(new Date("2026-10-12T09:00:00-04:00"));
    const after = await renderEvent(colorfest, "seed");
    expect(after).not.toContain('href="/moments/catoctin-colorfest-2026"');
  });

  it("leads with Directions on the way, keeps Tickets beside it, and sets the calendar aside", async () => {
    vi.setSystemTime(new Date("2026-10-06T17:30:00-04:00"));
    const html = await renderEvent({ ...event, ticket_url: "https://example.org/tickets" });
    const bar = section(html, "data-mobile-action-bar", "</div></div>");
    expect(bar).toMatch(/data-decision-action="directions" data-bar-primary="true"/);
    expect(bar).toMatch(/data-decision-action="ticket" aria-label/);
    expect(bar).not.toContain('aria-label="Add to calendar"');
    const desktop = section(html, 'data-event-actions="desktop"', "</div>");
    expect(desktop.indexOf("Directions")).toBeLessThan(desktop.indexOf("Tickets"));
    expect(count(desktop, "h-12")).toBe(1);
  });

  it("keeps Tickets as the one filled action the day before", async () => {
    vi.setSystemTime(new Date("2026-10-05T18:00:00-04:00"));
    const html = await renderEvent({ ...event, ticket_url: "https://example.org/tickets" });
    const bar = section(html, "data-mobile-action-bar", "</div></div>");
    expect(bar).toMatch(/data-decision-action="ticket" data-bar-primary="true"/);
    expect(bar).not.toMatch(/data-decision-action="directions" data-bar-primary/);
  });

  it("uses date plates when the location is not precise, and says what Radius has not confirmed", async () => {
    mocks.venue.mockReturnValue(null);
    const html = await renderEvent({
      ...event,
      slug: "county-fiber-weekend",
      venue_place_slug: undefined,
      geo_confidence: "area",
      starts_at: "2026-10-10T10:00:00-04:00",
      ends_at: "2026-10-11T16:00:00-04:00",
      source_url: null,
    });
    const hero = section(html, 'data-event-hero="date"', "</ul>");
    expect(count(hero, "<li")).toBe(2);
    expect(hero).toContain("Saturday, October 10, 2026");
    expect(hero).toContain("Sunday, October 11, 2026");
    expect(html).not.toContain("data-venue-mini-map=");
    expect(html).toContain("This listing spans several days. Hours can change by day, and Radius has not confirmed them.");
    expect(html).not.toContain("Check the event page for individual dates");
  });
});
