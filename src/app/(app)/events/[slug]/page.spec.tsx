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
import { MobileBarLink } from "@/components/ui/MobileActionBar";
import EventCalendarButton from "@/components/event/EventCalendarButton";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
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

describe("event detail source row", () => {
  const EventSourceLinkName = "EventSourceLink";
  const sourceLinkWrappers = (page: ReactNode) => {
    const nodes = elements(page);
    return nodes.filter(node => node.type === "span" && elements(node.props.children as ReactNode).some(child => typeof child.type === "function" && child.type.name === EventSourceLinkName));
  };

  it("hides the inline official link on desktop when the desktop row's action is the official page", async () => {
    mocks.resolve.mockResolvedValue({ kind: "live", event: { ...event, venue_place_slug: undefined } });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(sourceLinkWrappers(page).map(node => node.props.className)).toEqual(["lg:hidden"]);
    const official = elements(page).filter(node => node.props.href === event.source_url);
    expect(official.some(node => elements(node.props.children as ReactNode).some(child => child.props.children === "Official page") || (Array.isArray(node.props.children) && (node.props.children as unknown[]).includes("Official page")))).toBe(true);
  });

  it("keeps the inline official link at every width when the desktop row leads with another action", async () => {
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(sourceLinkWrappers(page)).toHaveLength(0);
    expect(elements(page).some(node => typeof node.type === "function" && node.type.name === EventSourceLinkName)).toBe(true);
  });

  it("hides the inline official link on desktop for an online event whose online link is the source page", async () => {
    // The venue stays set: "Online details" outranks the venue page in the
    // row, and with no separate online link it points at the source page.
    mocks.resolve.mockResolvedValue({ kind: "live", event: { ...event, attendance_mode: "online" } });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(sourceLinkWrappers(page).map(node => node.props.className)).toEqual(["lg:hidden"]);
  });

  it("hides the inline official link on desktop for a cancelled event whose announcement is the same page", async () => {
    mocks.resolve.mockResolvedValue({ kind: "live", event: { ...event, status: "cancelled" } });
    const page = await EventPage({ params: Promise.resolve({ slug: event.slug }), searchParams: Promise.resolve({}) });
    expect(sourceLinkWrappers(page).map(node => node.props.className)).toEqual(["lg:hidden"]);
  });
});

describe("event detail where and the phone bar", () => {
  // The audited FCPL row: a branch room that has no venue match, on the town
  // centroid, carrying the reviewed branch street address.
  const library: EventWithMeta = {
    ...event, slug: "family-fun-day", title: "Family Fun Day", source: "fcpl", source_url: "https://fcpl.example/family-fun-day",
    venue_name: "Emmitsburg Branch Library, Outside Library (EMM)", venue_place_slug: undefined,
    address: "300 S Seton Ave, Emmitsburg, MD 21727", geom: MUNICIPALITY_BY_SLUG.emmitsburg.centroid,
    municipality: "emmitsburg", municipality_name: "Emmitsburg", placement: undefined, geo_confidence: "area",
    category: "family", category_name: "Family", is_free: true,
  };
  const addressDirections = "https://www.google.com/maps/dir/?api=1&destination=300+S+Seton+Ave%2C+Emmitsburg%2C+MD+21727";
  const render = async (current: EventWithMeta) => {
    mocks.resolve.mockResolvedValue({ kind: "live", event: current });
    return elements(await EventPage({ params: Promise.resolve({ slug: current.slug }), searchParams: Promise.resolve({}) }));
  };
  const whereLink = (nodes: ReturnType<typeof elements>) => nodes.find((node) => node.type === "a" && node.props["data-event-where-directions"] !== undefined);
  const barCell = (nodes: ReturnType<typeof elements>, label: string) => nodes.find((node) => node.type === MobileBarLink && node.props.label === label);
  const calendarCell = (nodes: ReturnType<typeof elements>) => nodes.find((node) => node.type === EventCalendarButton && node.props.barVariant !== undefined);

  it("prints the street address under the venue and opens directions to that address, never the centroid", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render(library);
    const address = nodes.find((node) => node.props["data-event-address"] !== undefined);
    expect(address?.props.children).toBe("300 S Seton Ave, Emmitsburg, MD 21727");
    const link = whereLink(nodes);
    expect(link?.props.href).toBe(addressDirections);
    expect(link?.props.target).toBe("_blank");
    expect(link?.props.href).not.toContain(String(library.geom.lat));
  });

  it("makes Directions the phone bar's one filled action when there is no ticket", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render(library);
    expect(barCell(nodes, "Directions")?.props).toMatchObject({ href: addressDirections, primary: true });
    expect(calendarCell(nodes)?.props.barVariant).toBe("quiet");
    const filled = nodes.filter((node) => node.type === MobileBarLink && node.props.primary === true);
    expect(filled).toHaveLength(1);
  });

  it("keeps Tickets as the filled action and Directions quiet when tickets exist", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, ticket_url: "https://tickets.example/fun" });
    expect(barCell(nodes, "Tickets")?.props.primary).toBe(true);
    expect(barCell(nodes, "Directions")?.props.primary).toBe(false);
    expect(calendarCell(nodes)?.props.barVariant).toBe("quiet");
  });

  it("fills Add to calendar when there is no address, precise location or ticket", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, address: "", venue_name: "Emmitsburg" });
    expect(barCell(nodes, "Directions")).toBeUndefined();
    expect(whereLink(nodes)).toBeUndefined();
    const calendar = calendarCell(nodes)!;
    expect(calendar.props.barVariant).toBe("primary");
    const html = renderToStaticMarkup(calendar);
    expect(html).toContain(">Add to calendar</button>");
    expect(html).not.toMatch(/>Calendar</);
  });

  it.each([
    ["cancelled", { status: "cancelled" as const }],
    ["ended", { starts_at: "2026-10-06T09:00:00-04:00", ends_at: "2026-10-06T10:00:00-04:00" }],
  ])("keeps the address on a %s event without a directions link", async (_state, change) => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, ...change });
    expect(nodes.find((node) => node.props["data-event-address"] !== undefined)?.props.children).toBe(library.address);
    expect(whereLink(nodes)).toBeUndefined();
    expect(barCell(nodes, "Directions")).toBeUndefined();
    expect(nodes.some((node) => node.props.href === addressDirections)).toBe(false);
  });

  it("keeps the street when an iCal address starts with the venue name", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, venue_name: "Frederick Fairgrounds", address: "Frederick Fairgrounds, 797 E Patrick St, Frederick, MD 21701" });
    expect(nodes.find((node) => node.props["data-event-address"] !== undefined)?.props.children).toBe("797 E Patrick St, Frederick, MD 21701");
  });

  it("keeps the street when the venue field is only the town", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, venue_name: "Thurmont", address: "Thurmont Community Park, 21 Frederick Rd, Thurmont, MD 21788" });
    expect(nodes.find((node) => node.props["data-event-address"] !== undefined)?.props.children).toBe("Community Park, 21 Frederick Rd, Thurmont, MD 21788");
  });

  it("does not repeat the address when the venue line already is the street", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render({ ...library, venue_name: "121 N Bentz St", address: "121 N Bentz St, Frederick, MD 21701" });
    expect(nodes.find((node) => node.props["data-event-address"] !== undefined)).toBeUndefined();
    expect(whereLink(nodes)?.props.href).toContain("121+N+Bentz+St");
  });

  it("folds the source into one line after the description, keeping the publisher and official page", async () => {
    mocks.venue.mockReturnValue(null);
    const nodes = await render(library);
    const header = nodes.find((node) => node.type === "header" && node.props["data-decision-position"] === "detail")!;
    const headerNodes = elements(header);
    const line = headerNodes.findIndex((node) => node.props["data-event-source-line"] !== undefined);
    const description = headerNodes.findIndex((node) => node.type === "p" && node.props.children === library.description);
    expect(description).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(description);
    const lineNodes = elements(headerNodes[line]);
    expect(lineNodes.some((node) => node.props.children === "Published by Frederick County Public Libraries")).toBe(true);
    expect(lineNodes.some((node) => typeof node.type === "function" && node.type.name === "EventSourceLink")).toBe(true);
    expect(headerNodes.some((node) => node.type === "dt" && node.props.children === "Source")).toBe(false);
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
