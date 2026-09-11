import { describe, expect, it } from "vitest";
import {
  CLUSTER_FAMILIES,
  bucketOf,
  curatedClusterColorExpression,
  curatedClusterLabelExpression,
  curatedClusterProperties,
  dominantClusterFamilyLabel,
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

  it("generates one aggregation per declared family", () => {
    const properties = curatedClusterProperties();
    expect(Object.keys(properties)).toEqual(
      CLUSTER_FAMILIES.map((family) => family.key),
    );
    expect(properties.cf_coffee).toEqual([
      "+",
      ["case", ["in", ["get", "bucket"], ["literal", ["coffee"]]], 1, 0],
    ]);
  });

  it("builds color and meaning from the same family order", () => {
    const colors = JSON.stringify(curatedClusterColorExpression());
    const labels = JSON.stringify(curatedClusterLabelExpression());
    for (const family of CLUSTER_FAMILIES) {
      expect(colors).toContain(family.key);
      expect(colors).toContain(family.color);
      expect(labels).toContain(family.key);
      expect(labels).toContain(family.label);
    }
  });

  it("describes the dominant family without overstating an empty cluster", () => {
    expect(
      dominantClusterFamilyLabel({ cf_food: 2, cf_outdoors: 7 }),
    ).toBe("Outdoors");
    expect(dominantClusterFamilyLabel({ point_count: 12 })).toBeNull();
  });
});
