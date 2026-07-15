import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { isOperational, publicPlaceBySlug } from "@/lib/loaders/places";
import {
  isManualPlaceStatusReviewCurrent,
  manualPlaceStatusOverride,
} from "@/lib/place-status-overrides";

describe("manual place status overrides", () => {
  it("keeps a source-backed temporary closure above Google OPERATIONAL", () => {
    expect(manualPlaceStatusOverride("wiles-branch-dog-park-middletown")?.status)
      .toBe("closed_temporarily");
    expect(publicPlaceBySlug("wiles-branch-dog-park-middletown")).toBeUndefined();
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

  it("surfaces a missed review without automatically reopening", () => {
    const override = manualPlaceStatusOverride("wiles-branch-dog-park-middletown");
    expect(override).toBeDefined();
    expect(
      isManualPlaceStatusReviewCurrent(override!, new Date("2026-07-23T12:00:00Z")),
    ).toBe(false);
    expect(publicPlaceBySlug("wiles-branch-dog-park-middletown")).toBeUndefined();
  });
});
