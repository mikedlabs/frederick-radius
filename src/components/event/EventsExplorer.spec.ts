import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  eventGroupRenderState,
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
      hasLead: true,
      peek: 3,
    });

    expect(state).toEqual({
      groupCount: 9,
      totalRest: 8,
      canExpand: true,
    });
  });
});
