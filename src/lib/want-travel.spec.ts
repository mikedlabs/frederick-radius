import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  matrix: vi.fn(),
}));

vi.mock("@/lib/integrations/mapboxMatrix", () => ({
  getMapboxTravelMatrix: mocks.matrix,
}));

import { enrichWantAnswerWithWalkingTimes } from "@/lib/want-travel";
import type { WantAnswer, WantRow } from "@/lib/want-answer";

function row(slug: string, distance = "1 mi"): WantRow {
  return {
    slug,
    name: slug,
    fact: "Open until 9 PM",
    distance,
    photo: null,
    where: "Frederick",
    detail: null,
    tip: null,
    deal: null,
  };
}

function answer(
  rankingMode: WantAnswer["rankingMode"],
): WantAnswer {
  return {
    key: "coffee",
    label: "Coffee",
    rankingMode,
    hero: row("cafe-nola"),
    also: [
      row("gravel-and-grind-frederick"),
      row("starbucks-844"),
    ],
    later: [],
    laterMore: 0,
    notable: [],
    total: 3,
    mayAssertNoneOpen: true,
    browseHref: "/nearby?c=coffee",
    contextLabel: "Near you",
    contextSource: "device",
    fallbackReason: null,
  };
}

describe("enrichWantAnswerWithWalkingTimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a materially closer best-fit result up and adds routed evidence", async () => {
    mocks.matrix.mockResolvedValue({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [
        { destinationIndex: 0, destination: {}, reachable: true, durationSeconds: 620, minutes: 10, distanceMeters: 810 },
        { destinationIndex: 1, destination: {}, reachable: true, durationSeconds: 170, minutes: 3, distanceMeters: 220 },
        { destinationIndex: 2, destination: {}, reachable: true, durationSeconds: 390, minutes: 7, distanceMeters: 540 },
      ],
    });

    const result = await enrichWantAnswerWithWalkingTimes(
      answer("best-fit"),
      { lng: -77.41049, lat: 39.41437 },
    );

    expect(result.hero?.slug).toBe("gravel-and-grind-frederick");
    expect(result.hero?.distance).toBe("3 min walk");
    expect(result.hero?.travel).toEqual({
      mode: "walking",
      minutes: 3,
      distanceMeters: 220,
    });
  });

  it("keeps editorial order for best fits in the same three-minute band", async () => {
    mocks.matrix.mockResolvedValue({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [
        { destinationIndex: 0, destination: {}, reachable: true, durationSeconds: 160, minutes: 3, distanceMeters: 240 },
        { destinationIndex: 1, destination: {}, reachable: true, durationSeconds: 80, minutes: 1, distanceMeters: 100 },
        { destinationIndex: 2, destination: {}, reachable: true, durationSeconds: 240, minutes: 4, distanceMeters: 300 },
      ],
    });

    const result = await enrichWantAnswerWithWalkingTimes(
      answer("best-fit"),
      { lng: -77.41, lat: 39.414 },
    );

    expect([result.hero?.slug, ...result.also.map((item) => item.slug)]).toEqual([
      "cafe-nola",
      "gravel-and-grind-frederick",
      "starbucks-844",
    ]);
  });

  it("uses the real time delta instead of absolute three-minute buckets", async () => {
    mocks.matrix.mockResolvedValue({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [
        { destinationIndex: 0, destination: {}, reachable: true, durationSeconds: 181, minutes: 3, distanceMeters: 240 },
        { destinationIndex: 1, destination: {}, reachable: true, durationSeconds: 179, minutes: 3, distanceMeters: 230 },
        { destinationIndex: 2, destination: {}, reachable: true, durationSeconds: 500, minutes: 8, distanceMeters: 700 },
      ],
    });

    const result = await enrichWantAnswerWithWalkingTimes(
      answer("best-fit"),
      { lng: -77.41, lat: 39.414 },
    );

    expect([result.hero?.slug, ...result.also.map((item) => item.slug)]).toEqual([
      "cafe-nola",
      "gravel-and-grind-frederick",
      "starbucks-844",
    ]);
  });

  it("returns the original answer when Matrix fails", async () => {
    const input = answer("open-now");
    mocks.matrix.mockResolvedValue({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });

    await expect(
      enrichWantAnswerWithWalkingTimes(input, { lng: -77.41, lat: 39.414 }),
    ).resolves.toBe(input);
  });
});
