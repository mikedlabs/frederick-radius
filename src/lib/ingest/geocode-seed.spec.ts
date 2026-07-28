import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/places", () => ({
  PLACES: [
    {
      slug: "verified-place",
      address: "10 N Market St",
      city: "Frederick",
      postal_code: "21701",
      geom: { lat: 39.4142, lng: -77.4108 },
      is_verified: true,
    },
    {
      slug: "unreviewed-place",
      address: "20 N Market St",
      city: "Frederick",
      postal_code: "21701",
      geom: { lat: 39.4152, lng: -77.4108 },
      is_verified: false,
    },
    {
      slug: "outside-place",
      address: "100 N Charles St",
      city: "Baltimore",
      postal_code: "21201",
      geom: { lat: 39.2904, lng: -76.6122 },
      is_verified: true,
    },
  ],
}));

import {
  seedVenueCache,
  VERIFIED_CATALOG_CACHE_SOURCE,
  VERIFIED_GOOGLE_CACHE_SOURCE,
} from "@/lib/ingest/geocode";
import { normalizeForCache } from "@/lib/ingest/location";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

describe("seedVenueCache", () => {
  it("bulk-seeds only verified in-county catalog rows without replacing Google", async () => {
    const fragment = { kind: "bulk-values" };
    const sql = vi.fn(
      (first: TemplateStringsArray | unknown[], ...rest: unknown[]) => {
        void rest;
        return Array.isArray(first) && !("raw" in first)
          ? fragment
          : Promise.resolve({ count: 1 });
      },
    );

    const count = await seedVenueCache(sql as never);

    expect(count).toBe(1);
    expect(sql).toHaveBeenCalledTimes(2);
    const [bulkRows, ...columns] = sql.mock.calls[0];
    expect(bulkRows).toEqual([
      {
        norm_address: normalizeForCache("10 N Market St, Frederick, MD 21701"),
        lat: 39.4142,
        lng: -77.4108,
        source: VERIFIED_CATALOG_CACHE_SOURCE,
      },
    ]);
    expect(columns).toEqual(["norm_address", "lat", "lng", "source"]);

    const [strings, ...values] = sql.mock.calls[1];
    const text = queryText(strings as TemplateStringsArray);
    expect(text).toContain("insert into venue_geocache");
    expect(text).toContain("where venue_geocache.source <>");
    expect(values).toEqual([
      fragment,
      VERIFIED_GOOGLE_CACHE_SOURCE,
    ]);
  });
});
