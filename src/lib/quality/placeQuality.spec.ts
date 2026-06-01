import { describe, it, expect } from "vitest";
import { placeQuality } from "@/lib/quality/placeQuality";
import type { PlaceCardData } from "@/lib/loaders/places";

const q = (o: Partial<PlaceCardData>) => placeQuality(o as PlaceCardData);

describe("placeQuality", () => {
  it("ranks a confident, documented place above a bare one", () => {
    const rich = q({
      google_photo_url: "x.jpg",
      google_rating: 4.6,
      google_rating_count: 200,
      local_favorite: true,
      open_confidence: "verified",
      short_blurb: "A real description.",
    });
    expect(rich).toBeGreaterThan(q({}));
    expect(q({})).toBe(0);
  });

  it("ignores a high rating without enough reviews (no fabricated confidence)", () => {
    expect(q({ google_rating: 5, google_rating_count: 3 })).toBe(0);
  });

  it("rewards a local favorite even with no Google profile", () => {
    expect(q({ local_favorite: true })).toBeGreaterThan(q({ short_blurb: "x" }));
  });
});
