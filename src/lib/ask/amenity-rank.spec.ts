import { describe, it, expect } from "vitest";
import { compareAmenityRank } from "@/lib/ask/answer";

type C = Parameters<typeof compareAmenityRank>[0];

const cand = (name: string, municipality: string, distance: number | null, anchorDistance: number): C => ({
  amenity: { name, municipality },
  distance,
  anchorDistance,
});

describe("compareAmenityRank", () => {
  it("without a user origin, ranks by downtown proximity, not by name", () => {
    // "Ballenger" sorts before "Zzz" alphabetically, but it is far from
    // downtown; the closer downtown restroom must lead a county-wide answer.
    const park = cand("Ballenger Creek Park Portable Toilet", "Frederick", null, 6000);
    const downtown = cand("Zzz Downtown Public Restroom", "Frederick", null, 200);
    expect([park, downtown].sort((a, b) => compareAmenityRank(a, b, null))[0]).toBe(downtown);
  });

  it("with a real user origin, nearest wins outright regardless of anchor", () => {
    const far = cand("A", "Frederick", 500, 10);
    const near = cand("B", "Frederick", 100, 9000);
    expect([far, near].sort((a, b) => compareAmenityRank(a, b, null))[0]).toBe(near);
  });

  it("prefers a same-town match over one closer to downtown", () => {
    const local = cand("Zeta", "Brunswick", null, 9000);
    const downtown = cand("Alpha", "Frederick", null, 100);
    expect([downtown, local].sort((a, b) => compareAmenityRank(a, b, "Brunswick"))[0]).toBe(local);
  });

  it("falls back to name only when town and downtown distance tie", () => {
    const b = cand("Bravo", "Frederick", null, 500);
    const a = cand("Alpha", "Frederick", null, 500);
    expect([b, a].sort((x, y) => compareAmenityRank(x, y, null))[0]).toBe(a);
  });
});
