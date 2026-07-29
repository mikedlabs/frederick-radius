import { describe, expect, it } from "vitest";
import {
  normalizePublicParkAssets,
  publicParkAmenityKind,
} from "./fcParkAssetsPublic";

const point = (lng: number, lat: number) => ({
  type: "Point",
  coordinates: [lng, lat],
});

describe("public County park assets", () => {
  it("allowlists useful public assets and keeps availability honest", () => {
    const records = normalizePublicParkAssets(
      [
        {
          geometry: point(-77.41, 39.41),
          properties: {
            OBJECTID: 1,
            ParkName: "Baker Park",
            Type1: "Standard",
            last_edited_date: Date.UTC(2026, 3, 23),
            Notes: "maintenance note",
            CurrentInspectionNotes: "damaged",
            TotalCost: 999,
            MaintainedBy: "Internal division",
            created_user: "employee@example.com",
          },
        },
      ],
      [
        {
          geometry: point(-77.411, 39.411),
          properties: {
            OBJECTID: 2,
            ParkName: "Baker Park",
            Type1: "Drinking Fountain",
          },
        },
        {
          geometry: point(-77.412, 39.412),
          properties: {
            OBJECTID: 3,
            ParkName: "Baker Park",
            Type1: "Water Fountains/Hose Bibs",
          },
        },
      ],
    );

    expect(records.map((record) => record.kind).sort()).toEqual([
      "bench",
      "drinking_water",
      "water_fixture",
    ]);
    expect(records.every((record) => record.availability === "unknown")).toBe(true);
    expect(records.find((record) => record.kind === "drinking_water")?.potable).toBe(true);
    expect(records.find((record) => record.kind === "water_fixture")?.potable).toBeNull();
    const serialized = JSON.stringify(records);
    for (const sensitive of [
      "maintenance note",
      "damaged",
      "999",
      "Internal division",
      "employee@example.com",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("drops retired assets and non-public operational categories", () => {
    const records = normalizePublicParkAssets(
      [],
      [
        {
          geometry: point(-77.41, 39.41),
          properties: {
            OBJECTID: 4,
            Type1: "Trash Receptacle",
            Retired: Date.UTC(2026, 0, 1),
          },
        },
        {
          geometry: point(-77.41, 39.41),
          properties: { OBJECTID: 5, Type1: "Security Cameras" },
        },
        {
          geometry: point(-77.41, 39.41),
          properties: { OBJECTID: 6, Type1: "Septic Tank" },
        },
      ],
    );
    expect(records).toEqual([]);
    expect(publicParkAmenityKind("Trash Receptacle")).toBe("trash");
    expect(publicParkAmenityKind("Security Cameras")).toBeUndefined();
  });
});
