import { describe, expect, it } from "vitest";
import {
  formatReachMinutes,
  shortlistReachMatrixDestinations,
  sortReachByTravelTime,
} from "./withinReachModel";

describe("Within reach routed-time model", () => {
  it("creates a deterministic nine-destination shortlist", () => {
    const candidates = Array.from({ length: 11 }, (_, index) => ({
      id: `place:p-${10 - index}`,
      lng: -77.41,
      lat: 39.414,
      distanceMeters: index < 2 ? 100 : index * 100,
    }));
    candidates.push({ ...candidates[0] });

    const shortlist = shortlistReachMatrixDestinations(candidates);

    expect(shortlist).toHaveLength(9);
    expect(shortlist.slice(0, 2).map((item) => item.id)).toEqual([
      "place:p-10",
      "place:p-9",
    ]);
    expect(new Set(shortlist.map((item) => item.id)).size).toBe(9);
  });

  it("shows exact syntax only for a returned routed duration", () => {
    expect(formatReachMinutes(6, null)).toBe("~6m");
    expect(formatReachMinutes(6, 8)).toBe("8m");
  });

  it("ranks with routed minutes and falls back per missing cell", () => {
    const ranked = sortReachByTravelTime(
      [
        { matrixId: "place:coffee", minutes: 3 },
        { matrixId: "place:park", minutes: 5 },
        { matrixId: "amenity:bench", minutes: 2 },
      ],
      {
        "place:coffee": 9,
        "place:park": 4,
      },
    );

    expect(ranked.map((item) => item.matrixId)).toEqual([
      "amenity:bench",
      "place:park",
      "place:coffee",
    ]);
  });
});
