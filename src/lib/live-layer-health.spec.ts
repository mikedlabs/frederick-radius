import { describe, expect, it } from "vitest";
import {
  liveLayerHealth,
  liveLayerUsable,
} from "@/lib/live-layer-health";

const NOW = new Date("2026-07-23T16:00:00Z");

describe("live layer health envelope", () => {
  it("distinguishes a verified empty response from an unavailable source", () => {
    const empty = liveLayerHealth({
      count: 0,
      source: "TransIT Frederick",
      timestamp: "2026-07-23T15:59:00Z",
      now: NOW,
    });
    const unavailable = liveLayerHealth({
      source: "TransIT Frederick",
      unavailable: true,
      now: NOW,
    });

    expect(empty.status).toBe("empty");
    expect(liveLayerUsable(empty)).toBe(true);
    expect(unavailable.status).toBe("unavailable");
    expect(liveLayerUsable(unavailable)).toBe(false);
  });

  it("marks old source data stale and normalizes count/timestamp", () => {
    expect(
      liveLayerHealth({
        count: 17.9,
        source: "MDOT CHART",
        timestamp: "2026-07-23T15:00:00Z",
        maxAgeMs: 15 * 60 * 1000,
        now: NOW,
      }),
    ).toEqual({
      status: "stale",
      count: 17,
      source: "MDOT CHART",
      timestamp: "2026-07-23T15:00:00.000Z",
    });
  });

  it("lets disabled configuration win over apparent rows", () => {
    expect(
      liveLayerHealth({
        count: 4,
        source: "Mapillary",
        disabled: true,
        timestamp: "not-a-time",
      }),
    ).toEqual({
      status: "disabled",
      count: 4,
      source: "Mapillary",
      timestamp: null,
    });
  });

  it("preserves reports that could not be placed on the map", () => {
    expect(
      liveLayerHealth({
        count: 0,
        reportedCount: 2,
        notShownCount: 2,
        source: "FrederickScanner",
        timestamp: "2026-07-23T15:59:00Z",
        now: NOW,
      }),
    ).toEqual({
      status: "empty",
      count: 0,
      reportedCount: 2,
      notShownCount: 2,
      source: "FrederickScanner",
      timestamp: "2026-07-23T15:59:00.000Z",
    });
  });
});
