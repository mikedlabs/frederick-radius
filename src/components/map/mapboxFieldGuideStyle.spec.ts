import { describe, expect, it } from "vitest";
import {
  MAPBOX_FIELD_GUIDE_CONFIG,
  MAPBOX_FIELD_GUIDE_STYLE,
} from "./mapboxFieldGuideStyle";

describe("Mapbox field-guide style", () => {
  it("uses Standard with branded, quiet product-map defaults", () => {
    expect(MAPBOX_FIELD_GUIDE_STYLE).toBe("mapbox://styles/mapbox/standard");
    expect(MAPBOX_FIELD_GUIDE_CONFIG.basemap).toMatchObject({
      theme: "faded",
      showPointOfInterestLabels: false,
      show3dObjects: true,
      colorLand: "#F4EEE2",
      colorPlaceLabels: "#221C15",
    });
  });
});
