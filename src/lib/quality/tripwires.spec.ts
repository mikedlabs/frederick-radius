import { describe, expect, it } from "vitest";
import {
  availabilityAnomalies,
  photoMetadataCoverageAnomaly,
} from "@/lib/quality/tripwires";

describe("live-source availability tripwires", () => {
  it("does not flag a successful feed that happens to be empty", () => {
    expect(
      availabilityAnomalies([
        { source: "MDOT CHART", available: true },
        { source: "NWS alerts", available: true },
      ]),
    ).toEqual([]);
  });

  it("names every unavailable source instead of treating it as all-clear", () => {
    const anomalies = availabilityAnomalies([
      { source: "MDOT CHART", available: false },
      { source: "Potomac Edison", available: true },
      { source: "PulsePoint", available: false },
    ]);

    expect(anomalies.map((anomaly) => anomaly.source)).toEqual([
      "MDOT CHART",
      "PulsePoint",
    ]);
    expect(anomalies.every((anomaly) => anomaly.kind === "live_source_failed"))
      .toBe(true);
  });
});

describe("photo metadata coverage tripwire", () => {
  const name = "places/ChIJexample/photos/one";

  it("flags a photo catalog whose resource names have no exact source metadata", () => {
    expect(
      photoMetadataCoverageAnomaly([
        { photo_names: [name] },
        { photo_names: [`${name}-two`] },
      ]),
    ).toMatchObject({
      source: "google-photo-metadata",
      kind: "photo_rot",
    });
  });

  it("accepts publishable name-to-attribution pairs", () => {
    expect(
      photoMetadataCoverageAnomaly([
        {
          photo_names: [name],
          photo_attributions: [
            {
              photo_name: name,
              google_maps_uri:
                "https://www.google.com/maps/photos/example",
              authors: [],
            },
          ],
        },
      ]),
    ).toBeNull();
  });
});
