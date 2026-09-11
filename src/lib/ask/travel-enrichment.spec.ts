import { describe, expect, it, vi } from "vitest";

import type { LngLat } from "@/lib/geo";
import type { AskResult } from "@/lib/ask/contracts";
import {
  askTravelModeForQuery,
  enrichAskResultWithTravelTimes,
} from "@/lib/ask/travel-enrichment";

const origin: LngLat = { lng: -77.4105, lat: 39.4143 };

const result: AskResult = {
  status: "answered",
  configured: true,
  usedModel: true,
  answer: "First Place is the stronger fit, with Second Place as a backup.",
  sources: [
    {
      slug: "first",
      name: "First Place",
      category: "coffee",
      href: "/places/first",
      distance: "0.4 mi",
    },
    {
      slug: "second",
      name: "Second Place",
      category: "coffee",
      href: "/places/second",
      distance: "0.7 mi",
    },
    {
      slug: "event",
      name: "Current Event",
      category: "music",
      href: "/events/event",
    },
  ],
  intelligence: {
    tools: ["places"],
    confidence: "high",
    retrieval: "keyword",
  },
};

describe("Ask routed source evidence", () => {
  it("selects a route mode only for explicit travel language", () => {
    expect(askTravelModeForQuery("coffee near me")).toBe("walking");
    expect(askTravelModeForQuery("which is the shortest drive?")).toBe(
      "driving",
    );
    expect(askTravelModeForQuery("what can I bike to?")).toBe("cycling");
    expect(askTravelModeForQuery("best coffee for a meeting")).toBeNull();
  });

  it("replaces straight-line labels with routed evidence", async () => {
    const lookup = vi.fn(async () => ({
      available: true as const,
      mode: "walking" as const,
      routes: [
        {
          slug: "first",
          name: "First Place",
          mode: "walking" as const,
          minutes: 6,
          distanceMeters: 480,
          label: "6 min walk",
        },
        {
          slug: "second",
          name: "Second Place",
          mode: "walking" as const,
          minutes: 11,
          distanceMeters: 870,
          label: "11 min walk",
        },
      ],
    }));
    const resolvePlace = vi.fn((slug: string) => ({
      slug,
      name: slug === "first" ? "First Place" : "Second Place",
      geom:
        slug === "first"
          ? { lng: -77.411, lat: 39.415 }
          : { lng: -77.42, lat: 39.42 },
    }));

    const enriched = await enrichAskResultWithTravelTimes(
      result,
      "coffee near me",
      origin,
      { lookup, resolvePlace, timeoutMs: 1_800 },
    );

    expect(lookup).toHaveBeenCalledWith({
      origin,
      mode: "walking",
      timeoutMs: 1_800,
      candidates: [
        {
          slug: "first",
          name: "First Place",
          geom: { lng: -77.411, lat: 39.415 },
        },
        {
          slug: "second",
          name: "Second Place",
          geom: { lng: -77.42, lat: 39.42 },
        },
      ],
    });
    expect(enriched.sources.map((source) => source.distance)).toEqual([
      "6 min walk",
      "11 min walk",
      undefined,
    ]);
    expect(enriched.intelligence?.tools).toEqual([
      "places",
      "mapbox-travel",
    ]);
    expect(enriched.answer).toBe(result.answer);
  });

  it("does not call Mapbox without precise location or travel intent", async () => {
    const lookup = vi.fn();

    await expect(
      enrichAskResultWithTravelTimes(result, "coffee near me", null, {
        lookup,
      }),
    ).resolves.toBe(result);
    await expect(
      enrichAskResultWithTravelTimes(
        result,
        "best coffee for a meeting",
        origin,
        { lookup },
      ),
    ).resolves.toBe(result);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps the grounded result unchanged when routing fails", async () => {
    const lookup = vi.fn(async () => ({
      available: false as const,
      mode: "driving" as const,
      reason: "upstream-timeout",
      routes: [] as [],
    }));

    const unchanged = await enrichAskResultWithTravelTimes(
      result,
      "shortest drive",
      origin,
      {
        lookup,
        resolvePlace: (slug) => ({
          slug,
          name: slug,
          geom: { lng: -77.41, lat: 39.41 },
        }),
      },
    );

    expect(unchanged).toBe(result);
  });
});
