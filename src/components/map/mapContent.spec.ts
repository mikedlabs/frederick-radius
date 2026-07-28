import { describe, expect, it } from "vitest";
import {
  discoveryTrustLine,
  formatMapTimestamp,
  groupMapEvents,
  mapContentsSummary,
  radiusResultLine,
} from "./mapContent";
import type { EventPin } from "./types";

describe("formatMapTimestamp", () => {
  it("formats a source time in Frederick's Eastern timezone", () => {
    expect(formatMapTimestamp("2026-07-23T00:15:00.000Z")).toBe("Jul 22, 8:15 PM");
  });

  it("stays quiet for missing or invalid source times", () => {
    expect(formatMapTimestamp(null)).toBeNull();
    expect(formatMapTimestamp("not-a-date")).toBeNull();
  });
});

describe("discoveryTrustLine", () => {
  it("deduplicates sources and exposes a real evidence date", () => {
    expect(discoveryTrustLine([
      { fact: "One", source: "Frederick County GIS" },
      { fact: "Two", source: "Frederick County GIS" },
      { fact: "Three", source: "Radius field map", observedAt: "2026-07-23T00:15:00.000Z" },
    ])).toBe("Sources: Frederick County GIS + Radius field map · dated Jul 22, 8:15 PM");
  });

  it("does not imply freshness when the evidence is undated", () => {
    expect(discoveryTrustLine([
      { fact: "One", source: "City parking data" },
    ])).toBe("Sources: City parking data");
  });
});

describe("radiusResultLine", () => {
  it("leads with reachable and confirmed-open counts", () => {
    expect(radiusResultLine(61, 18)).toBe("61 places · 18 confirmed open");
    expect(radiusResultLine(1, 1)).toBe("1 place · 1 confirmed open");
  });

  it("describes the filtered result rather than the hidden total", () => {
    expect(radiusResultLine(61, 18, true)).toBe("18 confirmed open within reach");
  });

  it("keeps an empty radius distinct from an hours-coverage gap", () => {
    expect(radiusResultLine(0, 0)).toBe("No places within reach");
    expect(radiusResultLine(0, 0, true)).toBe("No places within reach");
  });

  it("does not turn an unknown-hours zero into a closure claim", () => {
    expect(radiusResultLine(61, 0)).toBe(
      "61 places · Open hours unconfirmed",
    );
    expect(radiusResultLine(61, 0, true)).toBe(
      "Open hours unconfirmed within reach",
    );
  });

  it("only reports none open after the caller clears the coverage gate", () => {
    expect(radiusResultLine(61, 0, false, true)).toBe(
      "61 places · None open now",
    );
    expect(radiusResultLine(61, 0, true, true)).toBe(
      "None open within reach",
    );
  });
});

describe("mapContentsSummary", () => {
  it("leads with area and the strongest active task", () => {
    expect(mapContentsSummary({
      area: "Frederick",
      amenity: "Restrooms",
      intent: "Coffee",
      time: "Tonight",
    })).toBe("Frederick · Restrooms");
  });

  it("stays quiet when the map has no refinement", () => {
    expect(mapContentsSummary({ area: "County" })).toBe("Contents");
  });
});

describe("groupMapEvents", () => {
  const event = (partial: Partial<EventPin>): EventPin => ({
    slug: "event",
    title: "Event",
    starts_at: "2026-07-23T22:00:00.000Z",
    venue_name: "Carroll Creek",
    lng: -77.4101,
    lat: 39.4142,
    category: "community",
    ...partial,
  });

  it("keeps co-located events in one chronological map group", () => {
    const groups = groupMapEvents([
      event({ slug: "late", title: "Late", starts_at: "2026-07-24T01:00:00.000Z" }),
      event({ slug: "early", title: "Early", starts_at: "2026-07-23T21:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].venueLabel).toBe("Carroll Creek");
    expect(groups[0].events.map((item) => item.slug)).toEqual(["early", "late"]);
  });

  it("does not hide events at distinct points", () => {
    const groups = groupMapEvents([
      event({ slug: "one" }),
      event({ slug: "two", lng: -77.4201 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.events)).toHaveLength(2);
  });
});
