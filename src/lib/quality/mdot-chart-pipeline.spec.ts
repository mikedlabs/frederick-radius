import { describe, expect, it } from "vitest";
import { transform } from "../../../transforms/mdot_chart";

describe("MDOT CHART pipeline transform", () => {
  it("reads the current export shape and keeps useful Frederick incidents", () => {
    const result = transform({
      data: [
        {
          id: "incident-1",
          county: "Frederick",
          name: "Incident @ I-70 EAST PAST EXIT 53 (EB)",
          incidentType: "Incident",
          direction: "East",
          lat: 39.42,
          lon: -77.36,
          startDateTime: 1_784_780_000_000,
          trafficAlert: true,
          closed: false,
          lanesStatus: "1/3 lanes closed",
        },
        {
          id: "noise-1",
          county: "Frederick",
          name: "Action Event @ US 15 [Traffic Control Signal]",
          incidentType: "Other",
          lat: 39.44,
          lon: -77.40,
          additionalData: { actionTypes: [{ actionType: "Signal Red Bulb Out" }] },
        },
        {
          id: "other-county",
          county: "Carroll",
          name: "Incident @ MD 140",
          lat: 39.55,
          lon: -77.0,
        },
      ],
    });

    expect(result.format).toBe("geojson");
    if (result.format !== "geojson") throw new Error("expected GeoJSON");
    expect(result.data.features).toHaveLength(1);
    expect(result.data.features[0].properties).toMatchObject({
      external_id: "incident-1",
      road: "I-70",
      incident_type: "incident",
      severity: "high",
      source: "mdot_chart",
    });
  });
});
