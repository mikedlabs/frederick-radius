import { describe, expect, it } from "vitest";
import {
  CLUSTER_FAMILIES,
  DESTINATION_CLUSTER_FAMILIES,
  NEUTRAL_CLUSTER_COLOR,
  bucketOf,
  clusterFamilyHoverLine,
  curatedClusterColorExpression,
  curatedClusterLabelExpression,
  curatedClusterProperties,
  dominantClusterFamilyLabel,
  isDestinationBucket,
} from "./categoryMarkers";

describe("semantic curated-place clusters", () => {
  it("rolls Frederick's distinct drink categories into the drink family", () => {
    const drink = CLUSTER_FAMILIES.find((family) => family.key === "cf_drink");
    expect(drink?.buckets).toEqual(
      expect.arrayContaining(["brewery", "wine", "bar"]),
    );
    expect(bucketOf("brewery")).toBe("brewery");
  });

  it("does not describe the service catalog as shops", () => {
    expect(
      CLUSTER_FAMILIES.find((family) => family.key === "cf_shops")?.buckets,
    ).toEqual(["shopping"]);
    expect(
      CLUSTER_FAMILIES.find((family) => family.key === "cf_services")?.buckets,
    ).toEqual(expect.arrayContaining(["services", "wellness", "lodging"]));
  });

  it("tallies only the destination families", () => {
    const properties = curatedClusterProperties();
    expect(Object.keys(properties)).toEqual([
      "cf_food",
      "cf_drink",
      "cf_coffee",
      "cf_outdoors",
      "cf_culture",
    ]);
    expect(Object.keys(properties)).toEqual(
      DESTINATION_CLUSTER_FAMILIES.map((family) => family.key),
    );
    expect(properties.cf_coffee).toEqual([
      "+",
      ["case", ["in", ["get", "bucket"], ["literal", ["coffee"]]], 1, 0],
    ]);
  });

  it("builds color and meaning from the destination families only", () => {
    const colors = JSON.stringify(curatedClusterColorExpression());
    const labels = JSON.stringify(curatedClusterLabelExpression());
    for (const family of CLUSTER_FAMILIES) {
      if (family.destination) {
        expect(colors).toContain(family.key);
        expect(colors).toContain(family.color);
        expect(labels).toContain(family.key);
        expect(labels).toContain(family.label);
      } else {
        expect(colors).not.toContain(family.key);
        expect(labels).not.toContain(family.key);
        expect(labels).not.toContain(`"${family.label}"`);
      }
    }
    // No destination place at all: a neutral tint and the plain word.
    expect((curatedClusterColorExpression() as unknown[]).at(-1)).toBe(NEUTRAL_CLUSTER_COLOR);
    expect((curatedClusterLabelExpression() as unknown[]).at(-1)).toBe("Places");
  });

  it("names downtown by what people go there for, not by its services", () => {
    // Services, civic and worship places still count in point_count, but a
    // block with 3 restaurants and 2 coffee shops reads as Food.
    const downtown = { point_count: 31, cf_food: 3, cf_coffee: 2 };
    expect(dominantClusterFamilyLabel(downtown)).toBe("Food");
    expect(isDestinationBucket(bucketOf("worship"))).toBe(false);
    expect(isDestinationBucket(bucketOf("salon"))).toBe(false);
    expect(isDestinationBucket(bucketOf("restaurant"))).toBe(true);
    expect(isDestinationBucket(bucketOf("park"))).toBe(true);
  });

  it("describes the dominant family without overstating an empty cluster", () => {
    expect(
      dominantClusterFamilyLabel({ cf_food: 2, cf_outdoors: 7 }),
    ).toBe("Outdoors");
    expect(dominantClusterFamilyLabel({ point_count: 12 })).toBeNull();
    // A stale aggregation key from a non-destination family is ignored.
    expect(dominantClusterFamilyLabel({ point_count: 12, cf_services: 12 })).toBeNull();
  });

  it("says mostly only when one family is more than half of the cluster", () => {
    expect(clusterFamilyHoverLine({ point_count: 10, cf_food: 6 })).toBe("Mostly food");
    expect(clusterFamilyHoverLine({ point_count: 31, cf_food: 3, cf_coffee: 2 })).toBeNull();
    expect(clusterFamilyHoverLine({ point_count: 8 })).toBeNull();
  });
});
