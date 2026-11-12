import { describe, expect, it } from "vitest";
import { nearbyParksPhotoPlan, nearbyParksRows } from "./nearby-parks-layout";

const creek = "carroll-creek-linear-park-frederick";
const baker = "baker-park-frederick";
const ballenger = "ballenger-creek-park-frederick";
const fountain = "fountain-rock-nature-center-walkersville";

describe("Parks presentation without a ranking change", () => {
  it("pairs adjacent exact candidates and preserves every original object/order", () => {
    const original = ["no-photo-a", creek, baker, "no-photo-b", ballenger, fountain, creek]
      .map((slug, ordinal) => ({ slug, ordinal }));
    const rows = nearbyParksRows(original);
    expect(rows.map(row => row.places.length)).toEqual([1, 2, 1, 2, 1]);
    expect(rows.flatMap(row => row.places)).toEqual(original);
    rows.flatMap(row => row.places).forEach((place, index) => expect(place).toBe(original[index]));
    expect(original).toHaveLength(7);
  });

  it("never jumps over an unpictured destination to fill a photo row", () => {
    const original = [{ slug: creek }, { slug: "unpictured" }, { slug: baker }];
    expect(nearbyParksRows(original).map(row => row.places.length)).toEqual([1, 1, 1]);
    expect(nearbyParksRows([])).toEqual([]);
  });

  it("admits only exact local registry plans, not remote or similarly named places", () => {
    expect(nearbyParksPhotoPlan(creek).sources[0].src).toBe("/images/places/carroll-creek-aerial.jpg");
    expect(nearbyParksPhotoPlan(ballenger).sources[0].kind).toBe("curated");
    for (const slug of ["carroll-creek-promenade", "historic-roddy-road-covered-bridge-thurmont", "unpictured"]) {
      expect(nearbyParksPhotoPlan(slug).sources).toEqual([]);
    }
    for (const source of nearbyParksPhotoPlan(ballenger).sources) {
      expect(source.kind).not.toBe("google");
      expect(source.src).toMatch(/^\/(?:images|place-photos)\//);
    }
  });
});
