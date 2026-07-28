import { describe, expect, it } from "vitest";
import {
  MATRIX_MAX_DESTINATIONS,
  matrixEtaQuery,
  parseMatrixDestination,
} from "./mapboxMatrix";

describe("Mapbox Matrix request helpers", () => {
  it("rounds the origin, keeps stable destination order, and caps the request", () => {
    const destinations = Array.from(
      { length: MATRIX_MAX_DESTINATIONS + 3 },
      (_, index) => ({
        id: `place:p-${index}`,
        lng: -77.41 + index / 10_000,
        lat: 39.414 + index / 10_000,
      }),
    );

    const params = new URLSearchParams(
      matrixEtaQuery(
        { lng: -77.41062, lat: 39.41437 },
        "drive",
        destinations,
      ),
    );

    expect(params.get("olng")).toBe("-77.411");
    expect(params.get("olat")).toBe("39.414");
    expect(params.get("mode")).toBe("drive");
    expect(params.getAll("d")).toHaveLength(9);
    expect(params.getAll("d")[0]).toContain("place:p-0");
    expect(params.getAll("d")[8]).toContain("place:p-8");
  });

  it("drops duplicate or unsafe destination IDs", () => {
    const params = new URLSearchParams(
      matrixEtaQuery(
        { lng: -77.411, lat: 39.414 },
        "walk",
        [
          { id: "place:coffee", lng: -77.41, lat: 39.415 },
          { id: "place:coffee", lng: -77.4, lat: 39.42 },
          { id: "bad,id", lng: -77.4, lat: 39.42 },
        ],
      ),
    );

    expect(params.getAll("d")).toEqual([
      "place:coffee,-77.41,39.415",
    ]);
  });

  it("parses the compact server destination contract strictly", () => {
    expect(
      parseMatrixDestination("amenity:bench-1,-77.41,39.415"),
    ).toEqual({
      id: "amenity:bench-1",
      lng: -77.41,
      lat: 39.415,
    });
    expect(parseMatrixDestination("bad,id,-77.41,39.415")).toBeNull();
    expect(parseMatrixDestination("place:foo,NaN,39.415")).toBeNull();
  });
});
