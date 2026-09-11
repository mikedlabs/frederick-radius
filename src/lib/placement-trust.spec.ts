import { describe, expect, it } from "vitest";
import {
  partitionFrederickCountyRows,
  placementRejectionReason,
} from "@/lib/placement-trust";
import {
  resolveFrederickMunicipality,
  resolveMunicipality,
} from "@/lib/location";

describe("placement trust boundary", () => {
  it("explains missing, malformed, and neighboring-county coordinates", () => {
    expect(placementRejectionReason(undefined)).toBe("missing-coordinate");
    expect(placementRejectionReason({ lng: Number.NaN, lat: 39.4 })).toBe(
      "invalid-coordinate",
    );
    expect(
      placementRejectionReason({ lng: -77.6528, lat: 39.5062 }),
    ).toBe("outside-county-area"); // Boonsboro, Washington County
    expect(
      placementRejectionReason({ lng: -77.4105, lat: 39.4143 }),
    ).toBeNull();
  });

  it("partitions without deleting rejected source rows", () => {
    const rows = [
      { id: "downtown", geom: { lng: -77.4105, lat: 39.4143 } },
      { id: "boonsboro", geom: { lng: -77.6528, lat: 39.5062 } },
    ];

    const result = partitionFrederickCountyRows(rows, (row) => row.geom);

    expect(result.accepted.map((row) => row.id)).toEqual(["downtown"]);
    expect(result.rejected).toEqual([
      {
        row: rows[1],
        reason: "outside-county-area",
      },
    ]);
  });

  it("does not turn an out-of-county point into the nearest Frederick town", () => {
    const baltimore = { lng: -76.61, lat: 39.29 };
    expect(resolveMunicipality(baltimore).municipality.slug).toBeTruthy();
    expect(resolveFrederickMunicipality(baltimore)).toBeNull();
    expect(
      resolveFrederickMunicipality({ lng: -77.4105, lat: 39.4143 })
        ?.municipality.slug,
    ).toBe("frederick");
  });
});
