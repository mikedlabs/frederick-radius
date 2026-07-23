import { describe, expect, it } from "vitest";
import { isAmenity } from "./constants";

describe("isAmenity", () => {
  it("keeps moderated community reports in the grouped map source", () => {
    expect(isAmenity({
      osm_id: "report:1",
      name: "Downed branch",
      category_slug: "report-hazard",
      osm_tag: "debris",
      lng: -77.41,
      lat: 39.41,
    })).toBe(true);
  });
});
