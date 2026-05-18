import { describe, it, expect } from "vitest";
import { transform } from "../transforms/usda_farmers_markets";
import type { UsdaFarmersMarketsRaw } from "../pipeline/schemas_ts/usda_farmers_markets";

// Fixture shaped like the USDA Local Food Portal response. Test values,
// not a recorded real result set.
const raw = {
  data: [
    {
      listing_id: 101,
      listing_name: "Frederick Downtown Market",
      location_address: "Market St, Frederick MD",
      location_x: "-77.4105",
      location_y: "39.4143",
      media_website: "https://example.org",
    },
    {
      listing_id: "202",
      listing_name: "Baltimore Market",
      location_x: "-76.61",
      location_y: "39.29",
    }, // out of county, dropped
    {
      listing_id: 303,
      listing_name: "No coords market",
      location_x: null,
      location_y: null,
    }, // dropped
  ],
} as unknown as UsdaFarmersMarketsRaw;

describe("transform(usda_farmers_markets)", () => {
  it("keeps only Frederick County markets and maps USDA x/y to lng/lat", () => {
    const d = transform(raw).data as {
      market_count: number;
      markets: { id: string; name: string; lat: number; lng: number }[];
    };
    expect(d.market_count).toBe(1);
    expect(d.markets[0]).toMatchObject({
      id: "101",
      name: "Frederick Downtown Market",
      lat: 39.4143,
      lng: -77.4105,
    });
  });

  it("never relocates or fabricates coordinates", () => {
    const d = transform(raw).data as { markets: { id: string }[] };
    expect(d.markets.find((m) => m.id === "303")).toBeUndefined();
    expect(d.markets.find((m) => m.id === "202")).toBeUndefined();
  });

  it("normalizes a numeric id to a string and a blank name to null", () => {
    const out = transform({
      data: [{ listing_id: 9, listing_name: "  ", location_x: "-77.41", location_y: "39.41" }],
    } as unknown as UsdaFarmersMarketsRaw);
    const d = out.data as { markets: { id: string; name: string | null }[] };
    expect(d.markets[0]).toMatchObject({ id: "9", name: null });
  });
});
