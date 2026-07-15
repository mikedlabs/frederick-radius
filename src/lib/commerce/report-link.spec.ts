import { describe, expect, it } from "vitest";
import { parseCommerceLinkReport } from "./report-link";

describe("parseCommerceLinkReport", () => {
  it("accepts the report shape sent by the place page", () => {
    expect(
      parseCommerceLinkReport({
        placeSlug: "cafe-nola-frederick",
        placeName: "Cafe Nola",
        note: "The menu link returns 404.",
      }),
    ).toMatchObject({
      place_slug: "cafe-nola-frederick",
      place_name: "Cafe Nola",
      note: "The menu link returns 404.",
    });
  });

  it("rejects oversized, malformed, and unexpected input", () => {
    expect(parseCommerceLinkReport({ placeSlug: "../admin" })).toBeNull();
    expect(parseCommerceLinkReport({ placeSlug: "cafe-nola", note: "x".repeat(281) })).toBeNull();
    expect(parseCommerceLinkReport({ placeSlug: "cafe-nola", admin: true })).toBeNull();
    expect(parseCommerceLinkReport({ placeSlug: "cafe-nola", url: "javascript:alert(1)" })).toBeNull();
  });
});
