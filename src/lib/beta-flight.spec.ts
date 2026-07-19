import { describe, it, expect } from "vitest";
import { pickAerials, coordLabel, flightLabel, type AerialEntry } from "./beta-flight";

// July in Eastern time — the season under test is summer.
const NOW = new Date("2026-07-19T16:00:00Z");

const entry = (over: Partial<AerialEntry>): AerialEntry => ({
  src: "/images/seasons/summer/a.jpg",
  lat: 39.4147,
  lng: -77.4256,
  altM: 120,
  takenAt: "2024-08-01T12:00:00Z",
  season: "summer",
  ...over,
});

describe("pickAerials", () => {
  it("prefers the current season, newest first", () => {
    const picked = pickAerials(
      [
        entry({ src: "w", season: "winter", takenAt: "2025-01-01T00:00:00Z", lat: 39.5 }),
        entry({ src: "s-old", takenAt: "2022-06-01T00:00:00Z", lat: 39.42 }),
        entry({ src: "s-new", takenAt: "2024-08-01T00:00:00Z", lat: 39.43 }),
      ],
      NOW,
    );
    expect(picked.map((e) => e.src)).toEqual(["s-new", "s-old", "w"]);
  });

  it("keeps one frame per vantage (dedupes near-identical fixes)", () => {
    const picked = pickAerials(
      [
        entry({ src: "a", takenAt: "2024-08-02T00:00:00Z", lat: 39.41471, lng: -77.42561 }),
        entry({ src: "b", takenAt: "2024-08-01T00:00:00Z", lat: 39.41469, lng: -77.42559 }),
      ],
      NOW,
    );
    expect(picked.map((e) => e.src)).toEqual(["a"]);
  });

  it("drops ground-level and bad barometric fixes", () => {
    const picked = pickAerials(
      [entry({ src: "low", altM: 0.5 }), entry({ src: "neg", altM: -78, lat: 39.5 })],
      NOW,
    );
    expect(picked).toEqual([]);
  });

  it("caps the reel", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      entry({ src: `s${i}`, lat: 39.4 + i * 0.01 }),
    );
    expect(pickAerials(many, NOW, 7)).toHaveLength(7);
  });
});

describe("labels", () => {
  it("prints the drone's fix as degrees with hemispheres", () => {
    expect(coordLabel(39.4147, -77.4256)).toBe("39.4147° N · 77.4256° W");
  });

  it("prints altitude and month, omitting a missing altitude", () => {
    expect(flightLabel(210.8, "2024-10-06T19:23:08.000Z")).toBe("211 m up · Oct 2024");
    expect(flightLabel(null, "2024-10-06T19:23:08.000Z")).toBe("Oct 2024");
  });
});
