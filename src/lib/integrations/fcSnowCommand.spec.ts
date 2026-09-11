import { describe, expect, it } from "vitest";
import { normalizeCountySnowRoutes, normalizeSnowStatus } from "./fcSnowCommand";

const geometry = {
  type: "LineString",
  coordinates: [
    [-77.42, 39.41],
    [-77.41, 39.42],
  ],
};

describe("SnowCommand normalization", () => {
  it("maps a dated operation report without leaking staff or fleet fields", () => {
    const [record] = normalizeCountySnowRoutes(
      [
        {
          geometry,
          properties: {
            OBJECTID: 7,
            STATUS: "Clear",
            TIMESTAMP: Date.UTC(2026, 0, 22, 8, 57),
            DISTRICT: "6",
            DRIVER: "Private employee",
            TRUCK_ID: "TRUCK-44",
            PROPERTY_NUMBER: "123456",
            COMMENT: "internal operations note",
          },
        },
      ],
      new Date("2026-07-28T12:00:00Z"),
    );

    expect(record).toMatchObject({
      id: "fc-snow-route-7",
      district: "6",
      reportedStatus: "clear",
      observedAt: "2026-01-22T08:57:00.000Z",
      freshness: "stale",
      roadSafety: "not_established",
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("Private employee");
    expect(serialized).not.toContain("TRUCK-44");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("internal operations note");
  });

  it("only recognizes a small public status allowlist", () => {
    expect(normalizeSnowStatus("Narrow Clear")).toBe("narrow_clear");
    expect(normalizeSnowStatus("Emergency Access")).toBe("emergency_access");
    expect(normalizeSnowStatus("Closed")).toBe("closed");
    expect(normalizeSnowStatus("Driver returning to yard")).toBe("unknown");
  });

  it("marks recent timestamps current but never labels the road safe", () => {
    const [record] = normalizeCountySnowRoutes(
      [
        {
          geometry,
          properties: {
            OBJECTID: 8,
            STATUS: "Clear",
            TIMESTAMP: Date.parse("2026-07-28T11:55:00Z"),
          },
        },
      ],
      new Date("2026-07-28T12:00:00Z"),
    );
    expect(record.freshness).toBe("current");
    expect(record.roadSafety).toBe("not_established");
  });
});
