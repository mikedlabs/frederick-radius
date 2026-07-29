import { describe, expect, it } from "vitest";
import { countyParkAssetAmenity } from "./countyParkAmenities";

describe("countyParkAssetAmenity", () => {
  it("keeps unknown availability visible on a public utility point", () => {
    expect(countyParkAssetAmenity({
      id: "fc-park-amenity-14",
      kind: "drinking_water",
      parkName: "Utica District Park",
      geometry: {
        type: "Point",
        coordinates: [-77.408, 39.53],
      },
      availability: "unknown",
      potable: true,
    })).toEqual({
      id: "fc-park-amenity-14",
      kind: "water",
      name: "Drinking fountain · Utica District Park",
      detail: "Frederick County park map · Availability is not confirmed",
      municipality: "walkersville",
      lng: -77.408,
      lat: 39.53,
    });
  });

  it("keeps an unspecified water fixture without calling it drinking water", () => {
    expect(countyParkAssetAmenity({
      id: "fc-park-amenity-15",
      kind: "water_fixture",
      geometry: {
        type: "Point",
        coordinates: [-77.408, 39.53],
      },
      availability: "unknown",
      potable: null,
    })).toEqual({
      id: "fc-park-amenity-15",
      kind: "other",
      name: "Water fixture",
      detail:
        "Frederick County park map · Potability and availability are not confirmed",
      municipality: "walkersville",
      lng: -77.408,
      lat: 39.53,
    });
  });

  it.each([
    ["dog_park", "dog_park", "Dog park"],
    ["boat_ramp", "water_access", "Water access"],
    ["paddle_launch", "water_access", "Water access"],
  ] as const)("projects %s as a useful mapped amenity", (sourceKind, kind, name) => {
    expect(countyParkAssetAmenity({
      id: `fc-park-amenity-${sourceKind}`,
      kind: sourceKind,
      geometry: {
        type: "Point",
        coordinates: [-77.408, 39.53],
      },
      availability: "unknown",
      potable: null,
    })).toMatchObject({ kind, name, municipality: "walkersville" });
  });
});
