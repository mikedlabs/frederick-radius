import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVENT_VENUE_ALIASES,
  matchEventVenuePlaceId,
} from "./venueAliases";
import { normalizeVenueKey } from "./normalize";

const CATALOG_SLUGS = new Set(
  (
    JSON.parse(
      readFileSync(new URL("../../data/places-client.json", import.meta.url), "utf8"),
    ) as Array<{ slug: string }>
  ).map((place) => place.slug),
);

describe("EVENT_VENUE_ALIASES", () => {
  it("points every alias at a real places-client.json slug", () => {
    for (const row of EVENT_VENUE_ALIASES) {
      expect(CATALOG_SLUGS.has(row.place_id), row.place_id).toBe(true);
    }
  });
});

describe("matchEventVenuePlaceId", () => {
  it("maps library Branch vs Public names and strips room/code suffixes", () => {
    expect(
      matchEventVenuePlaceId({
        venue_name: "C. Burr Artz Public Library, Programming Room (CBA)",
      }),
    ).toBe("c-burr-artz-public-library-frederick");
    expect(
      matchEventVenuePlaceId({
        venue_name: "Walkersville Branch Library, Darrell L Batson Community Room",
      }),
    ).toBe("walkersville-public-library-walkersville");
    expect(
      matchEventVenuePlaceId({ venue_name: "Walkersville Public Library" }),
    ).toBe("walkersville-public-library-walkersville");
  });

  it("treats Emmitsburg Avenue and Ave as the same street", () => {
    expect(normalizeVenueKey("300 South Seton Avenue")).toBe(
      normalizeVenueKey("300 S Seton Ave"),
    );
    expect(
      matchEventVenuePlaceId({ venue_name: "300 South Seton Avenue" }),
    ).toBe("emmitsburg-branch-library-emmitsburg");
  });

  it("leaves unmatched top venues unset instead of inventing places", () => {
    expect(
      matchEventVenuePlaceId({ venue_name: "Urbana Regional Library" }),
    ).toBeNull();
    expect(
      matchEventVenuePlaceId({
        venue_name: "Urbana Regional Library, Anthony M. Natelli Community Room",
      }),
    ).toBeNull();
    expect(matchEventVenuePlaceId({ venue_name: "1440 Taney Avenue" })).toBeNull();
    expect(matchEventVenuePlaceId({ venue_name: "101 Prospect St" })).toBeNull();
    expect(
      matchEventVenuePlaceId({ venue_name: "101 Prospect Street" }),
    ).toBeNull();
  });

  it("prefers an already-stamped catalog id", () => {
    expect(
      matchEventVenuePlaceId({
        venue_name: "Urbana Regional Library",
        venue_place_slug: "c-burr-artz-public-library-frederick",
      }),
    ).toBe("c-burr-artz-public-library-frederick");
  });
});
