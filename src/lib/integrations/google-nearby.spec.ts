import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchNearby } from "./google-nearby";

function googlePlace(location = { latitude: 39.4143, longitude: -77.4105 }) {
  return {
    id: "google-place-1",
    displayName: { text: "Downtown Coffee" },
    formattedAddress: "1 Market Street, Frederick, MD 21701",
    addressComponents: [
      { longText: "Maryland", shortText: "MD", types: ["administrative_area_level_1"] },
      { longText: "Frederick County", types: ["administrative_area_level_2"] },
      { longText: "Frederick", types: ["locality"] },
    ],
    location,
    primaryType: "coffee_shop",
  };
}

describe("Frederick-scoped Google nearby discovery", () => {
  const priorKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (priorKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = priorKey;
  });

  it("accepts Google's Frederick locality for the Frederick City scope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      places: [googlePlace()],
    }), { status: 200 }));

    await expect(searchNearby({ municipality: "frederick" })).resolves.toMatchObject({
      ok: true,
      count: 1,
      dropped_out_of_county: 0,
      places: [{ name: "Downtown Coffee" }],
    });
  });

  it("drops an address-labeled Frederick result whose coordinates are outside the county", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      places: [googlePlace({ latitude: 0, longitude: 0 })],
    }), { status: 200 }));

    await expect(searchNearby({})).resolves.toMatchObject({
      ok: true,
      count: 0,
      dropped_out_of_county: 1,
      places: [],
    });
  });
});
