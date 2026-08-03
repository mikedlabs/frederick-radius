import { describe, expect, it, vi } from "vitest";

import type { LngLat } from "@/lib/geo";
import type { MapboxMatrixResponse } from "@/lib/integrations/mapboxMatrix";
import {
  formatAskTravelTime,
  getAskTravelTimes,
  mapboxProfileForAskTravel,
  shortlistAskTravelCandidates,
  type AskTravelCandidate,
} from "@/lib/ask/mapbox-travel";

const origin: LngLat = { lng: -77.4105, lat: 39.4143 };

const candidates: AskTravelCandidate[] = [
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
  {
    slug: "third",
    name: "Third Place",
    geom: { lng: -77.43, lat: 39.43 },
  },
];

describe("Mapbox-backed Ask travel times", () => {
  it("uses traffic-aware routing for driving", () => {
    expect(mapboxProfileForAskTravel("driving")).toBe("driving-traffic");
    expect(mapboxProfileForAskTravel("walking")).toBe("walking");
    expect(mapboxProfileForAskTravel("cycling")).toBe("cycling");
  });

  it("formats compact decision labels", () => {
    expect(formatAskTravelTime("walking", 8)).toBe("8 min walk");
    expect(formatAskTravelTime("driving", 11)).toBe("11 min drive");
    expect(formatAskTravelTime("cycling", 6)).toBe("6 min bike");
  });

  it("deduplicates candidates and respects the nine-destination ceiling", () => {
    const many = [
      candidates[0],
      candidates[0],
      ...Array.from({ length: 12 }, (_, index) => ({
        slug: `extra-${index}`,
        name: `Extra ${index}`,
        geom: { lng: -77.4 - index / 1000, lat: 39.4 + index / 1000 },
      })),
    ];

    const shortlisted = shortlistAskTravelCandidates(many);
    expect(shortlisted).toHaveLength(9);
    expect(shortlisted[0]?.slug).toBe("first");
    expect(new Set(shortlisted.map((candidate) => candidate.slug)).size).toBe(9);
  });

  it("returns only reachable routes sorted by routed time", async () => {
    const response: MapboxMatrixResponse = {
      ok: true,
      profile: "walking",
      origin,
      legs: [
        {
          destinationIndex: 0,
          destination: candidates[0]!.geom,
          reachable: true,
          durationSeconds: 720,
          minutes: 12,
          distanceMeters: 930,
        },
        {
          destinationIndex: 1,
          destination: candidates[1]!.geom,
          reachable: false,
          durationSeconds: null,
          minutes: null,
          distanceMeters: null,
        },
        {
          destinationIndex: 2,
          destination: candidates[2]!.geom,
          reachable: true,
          durationSeconds: 300,
          minutes: 5,
          distanceMeters: 410,
        },
      ],
    };
    const lookup = vi.fn(async () => response);

    const result = await getAskTravelTimes(
      { origin, candidates, mode: "walking" },
      lookup,
    );

    expect(lookup).toHaveBeenCalledWith(
      {
        profile: "walking",
        origin,
        destinations: candidates.map((candidate) => candidate.geom),
      },
      { timeoutMs: 2_300 },
    );
    expect(result).toEqual({
      available: true,
      mode: "walking",
      routes: [
        {
          slug: "third",
          name: "Third Place",
          mode: "walking",
          minutes: 5,
          distanceMeters: 410,
          label: "5 min walk",
        },
        {
          slug: "first",
          name: "First Place",
          mode: "walking",
          minutes: 12,
          distanceMeters: 930,
          label: "12 min walk",
        },
      ],
    });
  });

  it("fails soft when Mapbox is unavailable", async () => {
    const lookup = vi.fn(async (): Promise<MapboxMatrixResponse> => ({
      ok: false,
      reason: "disabled",
      retryable: false,
    }));

    await expect(
      getAskTravelTimes(
        { origin, candidates: candidates.slice(0, 2), mode: "driving" },
        lookup,
      ),
    ).resolves.toEqual({
      available: false,
      mode: "driving",
      reason: "disabled",
      routes: [],
    });
  });
});
