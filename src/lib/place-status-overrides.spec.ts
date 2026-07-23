import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { isOperational, publicPlaceBySlug } from "@/lib/loaders/places";
import {
  isManualPlaceStatusReviewCurrent,
  manualPlaceStatusOverride,
} from "@/lib/place-status-overrides";

describe("manual place status overrides", () => {
  it("does not keep a removed closure override after an official reopening", () => {
    expect(
      manualPlaceStatusOverride("wiles-branch-dog-park-middletown"),
    ).toBeUndefined();
    expect(publicPlaceBySlug("wiles-branch-dog-park-middletown")).toBeDefined();
  });

  it("does not suppress another record with the same name", () => {
    const unrelated: Place = {
      slug: "unrelated-same-name",
      name: "Wiles Branch Dog Park",
      category: "park",
      short_blurb: "",
      address: "1 Example St",
      city: "Frederick",
      state: "MD",
      postal_code: "21701",
      municipality: "frederick",
      geom: { lng: -77.41, lat: 39.41 },
      is_verified: false,
      is_operational: "operational",
      feature_score: 1,
      source: "manual",
      updated_at: "2026-07-15",
    };
    expect(isOperational(unrelated)).toBe(true);
  });

  it("surfaces a missed review without treating its date as an automatic reopening", () => {
    expect(
      isManualPlaceStatusReviewCurrent(
        {
          status: "closed_temporarily",
          effective_at: "2026-07-04",
          review_after: "2026-07-22",
          source: "https://example.com/official-closure",
          note: "Closed until further notice.",
        },
        new Date("2026-07-23T12:00:00Z"),
      ),
    ).toBe(false);
  });
});
