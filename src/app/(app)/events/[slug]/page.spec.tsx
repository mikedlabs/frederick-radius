import { isValidElement, type ReactElement, type ReactNode } from "react";
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
import EventArtwork from "@/components/event/EventArtwork";
import EventVenuePhoto from "@/components/event/EventVenuePhoto";
import Image from "next/image";
import Link from "next/link";
import { EventResolutionTimeoutError, EventResolutionUnavailableError } from "@/lib/loaders/eventResolver";
const now = new Date("2026-10-06T12:00:00-04:00");
const event: EventWithMeta = { slug: "current-concert", title: "Evening concert", description: "A public concert.", starts_at: "2026-10-06T19:00:00-04:00", ends_at: "2026-10-06T22:00:00-04:00", timezone: "America/New_York", venue_name: "Weinberg Center", venue_place_slug: "venue", address: "20 W Patrick Street", geom: { lng: -77.4126, lat: 39.4142 }, municipality: "frederick", category: "music", audience: [], is_free: false, source: "manual", source_url: "https://example.org/concert", source_id: "42", license: "Publisher", confidence: "partner", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(), is_verified: true, category_name: "Music", municipality_name: "Frederick", placement: "venue", geo_confidence: "venue_match" };
function hasVisitEntry(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasVisitEntry);
  if (!isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node)) return false;
  return node.props["aria-label"] === "Plan this visit" || hasVisitEntry(node.props.children);
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node as ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
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

describe("event detail artwork presentation", () => {
  it("keeps publisher artwork after a separate title and published time, without a photo crop", async () => {
    const published = { ...event, source: "ticketmaster", hero_image: "https://s1.ticketm.net/dam/a/component-event.jpg" } as EventWithMeta;
    mocks.resolve.mockResolvedValue({ kind: "live", event: published });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    const nodes = elements(page);
    const header = nodes.find((node) => node.type === "header" && node.props["data-decision-position"] === "detail")!;
    const headerNodes = elements(header);
    const title = headerNodes.findIndex((node) => node.type === "h1");
    const art = headerNodes.findIndex((node) => node.type === EventArtwork);
    const time = headerNodes.findIndex((node) => typeof node.props.children === "string" && node.props.children.includes("7:00"));
    expect(headerNodes[title].props.children).toBe(event.title);
    expect(time).toBeGreaterThan(title);
    expect(art).toBeGreaterThan(time);
    expect(headerNodes[art].props.visual).toMatchObject({ src: published.hero_image, presentation: "artwork", caption: "Event image · Ticketmaster" });
    expect(headerNodes.some((node) => node.type === Image)).toBe(false);
    expect(nodes.some((node) => node.type === "nav" && node.props["aria-label"] === "Breadcrumb")).toBe(true);
  });

  it("keeps the owned exact venue image photographic", async () => {
    mocks.resolve.mockResolvedValue({ kind: "live", event: { ...event, venue_place_slug: "baker-park-bandshell" } });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    const nodes = elements(page);
    expect(nodes.some((node) => node.type === EventArtwork)).toBe(false);
    const photo = nodes.findIndex(node => node.type === EventVenuePhoto);
    expect(nodes[photo]?.props).toMatchObject({ visual: { src: "/images/seasons/fall/018.jpg", presentation: "photo" } });
    expect(nodes.findIndex(node => node.type === "h1")).toBeLessThan(photo);
    expect(nodes.some(node => node.props.href === "/events" && node.props.children === "Events")).toBe(true);
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

describe("event detail navigation loads destinations on intent", () => {
  it.each(["scheduled", "cancelled", "ended"] as const)("preserves real breadcrumb and action links for %s events without speculative loads", async (state) => {
    const current: EventWithMeta = state === "ended"
      ? { ...event, starts_at: "2026-10-06T10:00:00-04:00", ends_at: "2026-10-06T11:00:00-04:00" }
      : { ...event, status: state };
    mocks.resolve.mockResolvedValue({ kind: "live", event: current });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    const nodes = elements(page);
    const breadcrumb = nodes.find(node => node.type === "nav" && node.props["aria-label"] === "Breadcrumb")!;
    const crumbs = elements(breadcrumb).filter(node => node.type === Link);
    expect(crumbs.map(node => ({ href: node.props.href, label: node.props.children }))).toEqual([
      { href: "/events", label: "Events" },
      { href: "/m/frederick", label: "Frederick" },
    ]);
    const links = nodes.filter(node => node.type === Link);
    expect(links.length).toBeGreaterThan(2);
    for (const link of links) {
      expect(link.props.prefetch, String(link.props.href)).toBe(false);
      expect(link.props.href).toMatch(/^\//);
    }
    expect(links.some(node => node.props.href === (state === "scheduled" ? "/places/venue" : "/events?lens=today"))).toBe(true);
  });
});
