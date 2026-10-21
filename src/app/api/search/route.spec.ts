import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EventWithMeta } from "@/lib/loaders/events";
import { isEventSearchIntent } from "@/lib/search";
import { isLiveEventIndependentMapActionQuery } from "@/lib/search/index";

const mocks = vi.hoisted(() => ({
  loadEventArchiveSnapshot: vi.fn(),
  approxLocation: vi.fn(),
  recordSearchMiss: vi.fn(),
}));

vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
  TODAY_EVENT_SNAPSHOT_TIMEOUT_MS: 650,
}));

vi.mock("@/lib/ip-geo", () => ({
  approxLocation: mocks.approxLocation,
}));

vi.mock("@/lib/telemetry/searchMiss", () => ({
  recordSearchMiss: mocks.recordSearchMiss,
}));

import { GET } from "./route";

function request(query: string, origin = "map") {
  const url = new URL("https://frederickradius.app/api/search");
  url.searchParams.set("q", query);
  url.searchParams.set("origin", origin);
  url.searchParams.set("lat", "39.4143");
  url.searchParams.set("lng", "-77.4109");
  return new NextRequest(url);
}

function liveEvent(): EventWithMeta {
  return {
    slug: "radius-investor-showcase",
    title: "Radius Investor Showcase",
    description: "A live event supplied by the unified event assembly.",
    starts_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    ends_at: new Date(Date.now() + 3 * 60 * 60 * 1_000).toISOString(),
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Market Street, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    feature_score: 10,
    municipality_name: "Frederick",
    category_name: "Community",
  } as unknown as EventWithMeta;
}

describe("GET /api/search map fast path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [liveEvent()],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.approxLocation.mockResolvedValue({
      origin: null,
      status: "unavailable",
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("honors an explicit town over both map coordinates and a different stored town", async () => {
    const req = request("coffee");
    req.nextUrl.searchParams.set("in", "brunswick");
    req.cookies.set("fr_scope", "town:frederick");
    const body = await (await GET(req)).json();
    const places = body.results.filter((result: { type: string }) => result.type === "place");
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((result: { subtitle: string }) => result.subtitle.includes("Brunswick"))).toBe(true);
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("keeps an explicit county search from inheriting a stored town", async () => {
    const req = request("coffee");
    req.nextUrl.searchParams.set("in", "county");
    req.cookies.set("fr_scope", "town:brunswick");
    const body = await (await GET(req)).json();
    const places = body.results.filter((result: { type: string }) => result.type === "place");
    expect(places.some((result: { subtitle: string }) => !result.subtitle.includes("Brunswick"))).toBe(true);
  });

  it.each([
    ["trash can near me", "/map?amenity=trash"],
    ["public restroom", "/map?amenity=restroom"],
    ["parking", "/map?show=parking"],
  ])(
    "answers %s without waiting for live event assembly",
    async (query, expectedHref) => {
      const response = await GET(request(query));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results[0]).toMatchObject({
        type: "action",
        href: expectedHref,
      });
      expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
    },
  );

  it("keeps live event enrichment for map event searches", async () => {
    const response = await GET(request("Radius Investor Showcase"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledWith(
      expect.any(Date),
      { timeoutMs: 650 },
    );
    expect(body.results).toContainEqual(
      expect.objectContaining({
        id: "event:radius-investor-showcase",
        title: "Radius Investor Showcase",
      }),
    );
  });

  it.each(["DMV", "report a pothole", "water bill"])(
    "answers the official %s task without waiting for an unrelated calendar", async (query) => {
      const response = await GET(request(query, "global"));
      const body = await response.json();
      expect(body.results[0].id).toMatch(/^(?:civic|department):/);
      expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
    },
  );

  it("returns an ordinary local place search without assembling the calendar", async () => {
    const response = await GET(request("coffee nearby"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toContainEqual(
      expect.objectContaining({ type: "place" }),
    );
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("lets map ATM searches fall through to the live provider", async () => {
    const response = await GET(request("ATM"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("preserves the ATM handoff in global search", async () => {
    const response = await GET(request("ATM", "global"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({
      id: "action:map-atm",
      href: "/map?q=ATM",
    });
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it("labels honest base results when live event enrichment rejects", async () => {
    mocks.loadEventArchiveSnapshot.mockRejectedValue(
      new Error("Live event assembly unavailable"),
    );

    const response = await GET(request("events tonight"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.meta.liveEventsUnavailable).toBe(true);
  });

  it.each(["map", "global"])(
    "labels a resolved degraded archive in %s search",
    async (origin) => {
      mocks.loadEventArchiveSnapshot.mockResolvedValue({
        publicEvents: [],
        sourceHealth: {
          degraded: true,
          unavailable: ["event archive"],
        },
      });

      const response = await GET(request("events tonight", origin));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.meta.liveEventsUnavailable).toBe(true);
      expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
    },
  );

  it("returns an honest unavailable response and does not bank a false miss", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["event archive"],
      },
    });

    const response = await GET(request("zzqxwvnotreal", "global"));
    const body = await response.json();

    // 200, not 503. Both guarantees this test exists for are unchanged: the
    // response still SAYS events are unavailable, and it still refuses to bank
    // a miss it cannot trust. Only the transport changed, because the overlay
    // treats any non-ok as a network failure and rendered "Check your
    // connection" with no links out, over the person's own working connection.
    // A caveat on the answer should not be delivered as a failed request.
    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.meta.liveEventsUnavailable).toBe(true);
    expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
  });

  it.each([
    ["coffee nearby", "brunswick"],
    ["pharmacy", "county"],
    ["steak dinner", "county"],
  ])("returns the same scoped local %s answer while the archive never settles", async (query, scope) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date());
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(() => {}));
    const scopedRequest = (origin: string) => {
      const req = request(query, origin);
      req.nextUrl.searchParams.set("in", scope);
      req.cookies.set("fr_scope", "town:frederick");
      return req;
    };
    // Map already has this local path. Global Find must keep its complete
    // ranking, qualification and source facts, including an explicit lens.
    const expected = await (await GET(scopedRequest("map"))).json();
    // With explicit scope no async context lookup is required. A pending
    // calendar must not add even one unresolved await before this response.
    const response = await Promise.race([GET(scopedRequest("global")), Promise.resolve(null)]);
    expect(response, "a proven local answer must not wait for the event archive").not.toBeNull();
    if (!response) throw new Error("Local search is still waiting on the archive");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual(expected);
    expect(body.results.length).toBeGreaterThan(0);
    if (scope === "brunswick") {
      const places = body.results.filter((result: { type: string }) => result.type === "place");
      expect(places.length).toBeGreaterThan(0);
      expect(places.every((result: { subtitle: string }) => result.subtitle.includes("Brunswick"))).toBe(true);
    }
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });

  it.each(["Schifferstadt", "public restroom", "coffee events tonight", "public restroom events tonight"])("keeps mixed or event-shaped global query %s on the archive path", async query => {
    await GET(request(query, "global"));
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledExactlyOnceWith(expect.any(Date), { timeoutMs: 650 });
  });

  it("waits for the archive and returns its matching event for an otherwise unanswered title", async () => {
    let resolveArchive!: (snapshot: { publicEvents: EventWithMeta[]; sourceHealth: { degraded: boolean; unavailable: string[] } }) => void;
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(resolve => { resolveArchive = resolve; }));
    const req = request("Radius Investor Showcase", "global");
    req.nextUrl.searchParams.set("in", "county");
    const pending = GET(req);
    expect(await Promise.race([pending, Promise.resolve(null)])).toBeNull();
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
    resolveArchive({ publicEvents: [liveEvent()], sourceHealth: { degraded: false, unavailable: [] } });
    const body = await (await pending).json();
    expect(body.results).toContainEqual(expect.objectContaining({ id: "event:radius-investor-showcase" }));
  });

  it("does not mistake an archived Water Safety Training title for a complete global utility request", async () => {
    const query = "Water Safety Training";
    // These real parsers expose the ambiguity: a loose map shortcut is not
    // evidence that global search's mixed ranker has no relevant event.
    expect(isEventSearchIntent(query)).toBe(false);
    expect(isLiveEventIndependentMapActionQuery(query)).toBe(true);
    let resolveArchive!: (snapshot: { publicEvents: EventWithMeta[]; sourceHealth: { degraded: boolean; unavailable: string[] } }) => void;
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(resolve => { resolveArchive = resolve; }));
    const req = request(query, "global");
    req.nextUrl.searchParams.set("in", "county");
    const pending = GET(req);
    expect(await Promise.race([pending, Promise.resolve(null)])).toBeNull();
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
    resolveArchive({ publicEvents: [{ ...liveEvent(), slug: "water-safety-training", title: query }], sourceHealth: { degraded: false, unavailable: [] } });
    const body = await (await pending).json();
    expect(body.results).toContainEqual(expect.objectContaining({ id: "event:water-safety-training", title: query }));
  });

  it.each([
    ["Baker Park", "baker-park-frederick"],
    ["Baker Park Bandshell", "baker-park-bandshell"],
  ])("retains the existing archive wait while exact %s leads the generic layer", async (query, slug) => {
    let resolveArchive!: (snapshot: { publicEvents: EventWithMeta[]; sourceHealth: { degraded: boolean; unavailable: string[] } }) => void;
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(resolve => { resolveArchive = resolve; }));
    const req = request(query, "global");
    req.nextUrl.searchParams.set("in", "county");
    const pending = GET(req);
    expect(await Promise.race([pending, Promise.resolve(null)])).toBeNull();
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
    resolveArchive({ publicEvents: [liveEvent()], sourceHealth: { degraded: false, unavailable: [] } });
    const body = await (await pending).json();
    expect(body.results[0]).toMatchObject({ id: `place:${slug}`, href: `/places/${slug}` });
    expect(body.meta.liveEventsUnavailable).toBeUndefined();
  });


  it("still waits for archive enrichment when a complete place name can also name an event", async () => {
    const query = "Gravel & Grind";
    let resolveArchive!: (snapshot: { publicEvents: EventWithMeta[]; sourceHealth: { degraded: boolean; unavailable: string[] } }) => void;
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(resolve => { resolveArchive = resolve; }));
    const req = request(query, "global");
    req.nextUrl.searchParams.set("in", "county");
    req.nextUrl.searchParams.set("limit", "20");
    const pending = GET(req);
    expect(await Promise.race([pending, Promise.resolve(null)])).toBeNull();
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
    const event = { ...liveEvent(), slug: "gravel-grind-gathering", title: query };
    resolveArchive({ publicEvents: [event], sourceHealth: { degraded: false, unavailable: [] } });
    const body = await (await pending).json();
    expect(body.results).toContainEqual(expect.objectContaining({ id: "place:gravel-and-grind-frederick" }));
    expect(body.results).toContainEqual(expect.objectContaining({ id: `event:${event.slug}`, title: query }));
  });

});
