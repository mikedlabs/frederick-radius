import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  eventsForDefaultList,
  eventsMastheadCountState,
  eventScopeNeedsCompleteData,
  nearbyEventsWhereLabel,
  eventMatchesTimeWindow,
  eventGroupRenderState,
  eventsBrowseRequest,
  initialBrowseIsComplete,
  reconcileBrowseResponse,
} from "./EventsExplorer";

function event(
  slug: string,
  category: string,
  startsAt = "2026-07-30T18:00:00.000Z",
): EventWithMeta {
  return {
    slug,
    title: `Event ${slug}`,
    description: "",
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Test St",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    category,
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    source_id: slug,
    source_url: "https://example.com/events",
    license: "test",
    confidence: "curated",
    first_seen_at: "2026-07-29T12:00:00.000Z",
    last_verified_at: "2026-07-29T12:00:00.000Z",
    geo_confidence: "venue_match",
    category_name: category,
    municipality_name: "Frederick",
  };
}

describe("EventsExplorer deferred browse reconciliation", () => {
  it("keeps personalized event results hidden until browser scope and filters are restored", () => {
    const source = readFileSync("src/components/event/EventsExplorer.tsx", "utf8");

    expect(source).toContain("data-events-restoring-view");
    expect(source).toContain("data-events-personalized-view hidden={!urlReady}");
    expect(source).toContain("Radius is restoring your town, time, and event filters.");
  });

  it("bypasses a cached degraded response only when the person checks again", () => {
    expect(eventsBrowseRequest()).toEqual({
      url: "/api/events/browse",
      init: { headers: { Accept: "application/json" } },
    });
    expect(eventsBrowseRequest(true)).toEqual({
      url: "/api/events/browse?refresh=1",
      init: {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    });
  });

  it("loads the complete event population before claiming a near-me ranking", () => {
    expect(eventScopeNeedsCompleteData("nearme")).toBe(true);
    expect(eventScopeNeedsCompleteData("county")).toBe(false);
    expect(eventScopeNeedsCompleteData("town:frederick")).toBe(false);
  });

  it("does not claim a complete nearby ranking while the continuation is pending or failed", () => {
    expect(nearbyEventsWhereLabel({
      hasOrigin: true,
      dataComplete: false,
      loading: true,
      failed: false,
    })).toBe("Ranking nearby events…");
    expect(nearbyEventsWhereLabel({
      hasOrigin: true,
      dataComplete: false,
      loading: false,
      failed: true,
    })).toBe("Nearby ranking unavailable");
    expect(nearbyEventsWhereLabel({
      hasOrigin: true,
      dataComplete: true,
      loading: false,
      failed: false,
    })).toBe("Ranked near you");
  });

  it("never treats a same-size degraded server snapshot as complete", () => {
    expect(initialBrowseIsComplete(27, 27, { degraded: true })).toBe(false);
    expect(initialBrowseIsComplete(27, 27, { degraded: false })).toBe(true);
    expect(initialBrowseIsComplete(27, 838, { degraded: false })).toBe(false);
  });

  it("labels partial query counts while preserving a healthy complete summary", () => {
    expect(eventsMastheadCountState({
      loadedCount: 27,
      summaryCount: 838,
      dataComplete: false,
      anyFilter: false,
      sourceDegraded: false,
    })).toEqual({ eventCount: 838, complete: true, usesCompleteSummary: true });

    expect(eventsMastheadCountState({
      loadedCount: 27,
      summaryCount: 27,
      dataComplete: false,
      anyFilter: false,
      sourceDegraded: true,
    })).toEqual({ eventCount: 27, complete: false, usesCompleteSummary: false });

    expect(eventsMastheadCountState({
      loadedCount: 4,
      summaryCount: 838,
      dataComplete: false,
      anyFilter: true,
      sourceDegraded: false,
    })).toEqual({ eventCount: 4, complete: false, usesCompleteSummary: false });
  });

  it("collapses series only on the untouched default list", () => {
    const recurring = [
      {
        ...event("weekly-a", "community", "2026-07-30T18:00:00.000Z"),
        title: "Weekly Meetup · Session A",
        is_recurring: true,
        recurrence_text: "Every Thursday",
      },
      {
        ...event("weekly-b", "community", "2026-08-06T18:00:00.000Z"),
        title: "Weekly Meetup · Session B",
        is_recurring: true,
        recurrence_text: "Every Thursday",
      },
    ];
    const bounds = {
      now: Date.parse("2026-07-29T12:00:00.000Z"),
      next24: Date.parse("2026-07-30T04:00:00.000Z"),
      weekendStart: Date.parse("2026-07-31T04:00:00.000Z"),
      weekendEnd: Date.parse("2026-08-03T04:00:00.000Z"),
      live: new Set<string>(),
    };

    expect(eventsForDefaultList({
      events: recurring,
      view: "list",
      sort: "recommended",
      anyFilter: false,
      bounds,
    })).toHaveLength(1);
    expect(eventsForDefaultList({
      events: recurring,
      view: "list",
      sort: "recommended",
      anyFilter: true,
      bounds,
    })).toHaveLength(2);
    expect(eventsForDefaultList({
      events: recurring,
      view: "calendar",
      sort: "recommended",
      anyFilter: false,
      bounds,
    })).toHaveLength(2);
  });

  it("does not turn Outdoors 9 into 0 when a degraded fetch omits that feed", () => {
    const trustedEvents = Array.from({ length: 9 }, (_, index) =>
      event(`outdoors-${index}`, "outdoors", `2026-07-${String(30 + (index % 2)).padStart(2, "0")}T${String(14 + index).padStart(2, "0")}:00:00.000Z`),
    );
    const degradedPayload = {
      events: [event("music-that-loaded", "music")],
      liveSlugs: ["music-that-loaded"],
      generatedAt: "2026-07-29T16:00:00.000Z",
      sourceHealth: {
        degraded: true,
        unavailable: ["recreation"],
      },
    };

    expect(degradedPayload.events.filter((item) => item.category === "outdoors")).toHaveLength(0);

    const reconciled = reconcileBrowseResponse(
      trustedEvents,
      ["outdoors-0"],
      degradedPayload,
    );

    expect(reconciled.events.filter((item) => item.category === "outdoors")).toHaveLength(9);
    expect(reconciled.events.map((item) => item.slug)).toContain("music-that-loaded");
    expect(reconciled.liveSlugs).toEqual(["outdoors-0", "music-that-loaded"]);
    expect(reconciled.sourceHealth).toEqual(degradedPayload.sourceHealth);
    expect(reconciled.dataComplete).toBe(false);
  });

  it("replaces the snapshot after a healthy complete response", () => {
    const reconciled = reconcileBrowseResponse(
      [event("old-outdoors", "outdoors")],
      ["old-outdoors"],
      {
        events: [event("current-music", "music")],
        liveSlugs: [],
        generatedAt: "2026-07-29T16:00:00.000Z",
        sourceHealth: {
          degraded: false,
          unavailable: [],
        },
      },
    );

    expect(reconciled.events.map((item) => item.slug)).toEqual(["current-music"]);
    expect(reconciled.liveSlugs).toEqual([]);
    expect(reconciled.dataComplete).toBe(true);
  });

  it("fails closed when a response omits source-health metadata", () => {
    const reconciled = reconcileBrowseResponse(
      [event("known-event", "outdoors")],
      ["known-event"],
      {
        events: [],
        generatedAt: "2026-07-29T16:00:00.000Z",
      },
    );

    expect(reconciled.events.map((item) => item.slug)).toEqual(["known-event"]);
    expect(reconciled.liveSlugs).toEqual(["known-event"]);
    expect(reconciled.sourceHealth.degraded).toBe(true);
    expect(reconciled.dataComplete).toBe(false);
  });

  it("keeps rows from a newly populated degraded horizon expandable", () => {
    const state = eventGroupRenderState({
      // The server snapshot had no events in this horizon, but a partial
      // refresh successfully returned seven before another source failed.
      summaryCount: 0,
      loadedCount: 7,
      dataComplete: false,
      anyFilter: false,
      sourceDegraded: true,
      hasLead: true,
      peek: 3,
    });

    expect(state).toEqual({
      groupCount: 7,
      totalRest: 6,
      canExpand: true,
    });
  });

  it("keeps a larger trusted summary count while the browse response is incomplete", () => {
    const state = eventGroupRenderState({
      summaryCount: 9,
      loadedCount: 4,
      dataComplete: false,
      anyFilter: false,
      sourceDegraded: false,
      hasLead: true,
      peek: 3,
    });

    expect(state).toEqual({
      groupCount: 9,
      totalRest: 8,
      canExpand: true,
    });
  });

  it("does not mix a stale horizon total into degraded partial results", () => {
    const state = eventGroupRenderState({
      summaryCount: 47,
      loadedCount: 4,
      dataComplete: false,
      anyFilter: false,
      sourceDegraded: true,
      hasLead: true,
      peek: 3,
    });

    expect(state).toEqual({
      groupCount: 4,
      totalRest: 3,
      canExpand: false,
    });
  });
});

describe("EventsExplorer event time windows", () => {
  const bounds = {
    now: Date.parse("2026-08-01T10:00:01-04:00"),
    next24: Date.parse("2026-08-02T00:00:00-04:00"),
    weekendStart: Date.parse("2026-07-31T17:00:00-04:00"),
    weekendEnd: Date.parse("2026-08-03T00:00:00-04:00"),
  };

  it("keeps a brunch card in Today and This week after it starts", () => {
    const brunch = event("brunch", "food", "2026-08-01T10:00:00-04:00");
    brunch.ends_at = "2026-08-01T12:00:00-04:00";
    expect(eventMatchesTimeWindow(brunch, "today", bounds)).toBe(true);
    expect(eventMatchesTimeWindow(brunch, "week", bounds)).toBe(true);
  });

  it("keeps a just-started unknown-end event in Today without requiring a live claim", () => {
    const market = event("market", "community", "2026-08-01T09:15:00-04:00");
    delete (market as Partial<EventWithMeta>).ends_at;
    expect(eventMatchesTimeWindow(market, "today", bounds)).toBe(true);
    expect(eventMatchesTimeWindow(market, "week", bounds)).toBe(true);
  });

  it("drops an unknown-end event after its bounded visibility window", () => {
    const market = event("market", "community", "2026-08-01T09:15:00-04:00");
    delete (market as Partial<EventWithMeta>).ends_at;
    expect(
      eventMatchesTimeWindow(market, "today", {
        ...bounds,
        now: Date.parse("2026-08-01T11:15:01-04:00"),
      }),
    ).toBe(false);
  });

  it("drops the brunch card after it really ends", () => {
    const brunch = event("brunch", "food", "2026-08-01T10:00:00-04:00");
    brunch.ends_at = "2026-08-01T12:00:00-04:00";
    expect(
      eventMatchesTimeWindow(brunch, "today", {
        ...bounds,
        now: Date.parse("2026-08-01T12:00:01-04:00"),
      }),
    ).toBe(false);
  });

  it("does not put a live weekday event into the upcoming weekend", () => {
    const mondayBounds = {
      now: Date.parse("2026-08-03T10:30:00-04:00"),
      next24: Date.parse("2026-08-04T00:00:00-04:00"),
      weekendStart: Date.parse("2026-08-07T17:00:00-04:00"),
      weekendEnd: Date.parse("2026-08-10T00:00:00-04:00"),
    };
    const mondayEvent = event("monday", "food", "2026-08-03T10:00:00-04:00");
    mondayEvent.ends_at = "2026-08-03T11:00:00-04:00";
    expect(eventMatchesTimeWindow(mondayEvent, "today", mondayBounds)).toBe(true);
    expect(eventMatchesTimeWindow(mondayEvent, "weekend", mondayBounds)).toBe(false);
  });

  it("preserves the eight-hour cap on inflated feed ends", () => {
    const daytime = event("daytime", "community", "2026-08-01T10:00:00-04:00");
    daytime.ends_at = "2026-08-01T23:59:00-04:00";
    expect(
      eventMatchesTimeWindow(daytime, "all", {
        ...bounds,
        now: Date.parse("2026-08-01T19:00:00-04:00"),
      }),
    ).toBe(false);
  });
});
