import { describe, expect, it } from "vitest";
import {
  normalizeFloodContextPoints,
  normalizeHighWaterAreas,
} from "./fcFloodRisk";

describe("County flood-context normalization", () => {
  it("represents mapped risk without claiming current flooding", () => {
    const [area] = normalizeHighWaterAreas([
      {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-77.56, 39.5],
              [-77.55, 39.5],
              [-77.55, 39.51],
              [-77.56, 39.5],
            ],
          ],
        },
        properties: {
          OBJECTID: 1,
          CREEK: "Catoctin Creek",
          ROADWAY_CLASS: 1,
          GlobalID: "internal-global-id",
          Notes: "not public",
        },
      },
    ]);

    expect(area).toMatchObject({
      id: "fc-high-water-1",
      kind: "mapped_high_water_area",
      creek: "Catoctin Creek",
      currentFlooding: "not_established",
    });
    expect(JSON.stringify(area)).not.toContain("internal-global-id");
    expect(JSON.stringify(area)).not.toContain("not public");
  });

  it("labels warning signs and historical rescues without a current incident", () => {
    const point = {
      type: "Point",
      coordinates: [-77.55, 39.5],
    };
    const records = normalizeFloodContextPoints(
      [
        {
          geometry: point,
          properties: {
            OBJECTID: 2,
            CREEK: "Catoctin Creek",
            SIGN_TYPE: "RCPS",
            SIGN_ID: 9001,
          },
        },
      ],
      [
        {
          geometry: point,
          properties: {
            OBJECTID: 3,
            CREEK: "Israel Creek",
            LABEL: "WATER RESCUE",
          },
        },
      ],
    );

    expect(records).toEqual([
      expect.objectContaining({
        kind: "warning_sign",
        currentIncident: "not_established",
      }),
      expect.objectContaining({
        kind: "past_water_rescue",
        currentIncident: "not_established",
      }),
    ]);
    expect(JSON.stringify(records)).not.toContain("RCPS");
    expect(JSON.stringify(records)).not.toContain("9001");
    expect(JSON.stringify(records)).not.toContain("WATER RESCUE");
  });
});
