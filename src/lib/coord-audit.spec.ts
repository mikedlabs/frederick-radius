import { describe, expect, it } from "vitest";
import { auditCoordDivergence } from "./coord-audit";

describe("auditCoordDivergence", () => {
  it("flags the same listing when its coordinates diverge", () => {
    const flags = auditCoordDivergence(
      [{ name: "Example Cafe", address: "10 Market St", geom: { lat: 39.414, lng: -77.411 } }],
      [{ name: "Example Cafe", address: "10 Market Street", geom: { lat: 39.424, lng: -77.411 } }],
      200,
    );
    expect(flags).toHaveLength(1);
  });

  it("does not compare separate branches that share a business name", () => {
    const flags = auditCoordDivergence(
      [{ name: "Black Hog BBQ & Bar", address: "100 Middletown Pkwy", geom: { lat: 39.43649, lng: -77.53071 } }],
      [{ name: "Black Hog BBQ & Bar", address: "118 S Market St", geom: { lat: 39.41111, lng: -77.41117 } }],
      200,
    );
    expect(flags).toEqual([]);
  });

  it("uses the matching branch when the source contains multiple locations", () => {
    const flags = auditCoordDivergence(
      [{ name: "Local Chain", address: "20 Main St", geom: { lat: 39.414, lng: -77.411 } }],
      [
        { name: "Local Chain", address: "10 Main St", geom: { lat: 39.5, lng: -77.5 } },
        { name: "Local Chain", address: "20 Main Street", geom: { lat: 39.4141, lng: -77.4111 } },
      ],
      200,
    );
    expect(flags).toEqual([]);
  });
});
