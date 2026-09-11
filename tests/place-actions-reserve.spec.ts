import { describe, it, expect } from "vitest";
import { placeActions } from "@/lib/place-actions";
import type { Place } from "@/data/places";

/**
 * Reserve-handoff URL contract. The 404 these lock out: opentable_id
 * is a restref integer, so it must go through /restref/client/?restref=
 * — the /r/restaurant/profile/ path 404s on a restref id. When no id is
 * present, the prefilled geo-search is the always-lands fallback.
 */
function base(extra: Partial<Place>): Place {
  return {
    name: "Test Restaurant",
    city: "Frederick",
    category: "restaurant",
    geom: { lat: 39.4143, lng: -77.4105 },
    ...extra,
  } as Place;
}

function reservationAction(p: Place) {
  return placeActions(p).find(
    (a) => a.key === "reserve" || a.key === "reserve-search",
  );
}

function reserveHref(p: Place): string | undefined {
  return reservationAction(p)?.href;
}

describe("placeActions — reserve handoff", () => {
  it("routes an opentable_id through the restref client redirect (not the profile path)", () => {
    const href = reserveHref(base({ opentable_id: "123456" }));
    expect(href).toContain("opentable.com/restref/client/?restref=123456");
    expect(href).not.toContain("/r/restaurant/profile/");
  });

  it("falls back to a geo-anchored OpenTable search when there is no id", () => {
    const action = reservationAction(base({}));
    const href = action?.href;
    expect(action).toMatchObject({
      key: "reserve-search",
      label: "Search OpenTable",
    });
    expect(href).toContain("opentable.com/s?");
    expect(href).toContain("latitude=39.4143");
    expect(href).toContain("longitude=-77.4105");
  });

  it("prefers Resy when a resy_slug is present", () => {
    const href = reserveHref(base({ resy_slug: "volt" }));
    expect(href).toBe("https://resy.com/cities/frederick-md/venues/volt");
  });

  it("offers no reserve action for non-dining categories", () => {
    expect(reserveHref(base({ category: "park" }))).toBeUndefined();
  });
});
