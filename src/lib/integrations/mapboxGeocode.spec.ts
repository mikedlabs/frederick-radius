import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGeocodeQuery,
  geocodeForwardUncached,
  looksLikeStreetAddress,
  normalizeAddressKey,
  parseGeocodeResponse,
} from "@/lib/integrations/mapboxGeocode";

function v6Response(
  lng: number,
  lat: number,
  featureType: string = "address",
): unknown {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { feature_type: featureType },
      },
    ],
  };
}

describe("looksLikeStreetAddress", () => {
  it("accepts a leading house number", () => {
    expect(looksLikeStreetAddress("123 Main St, Frederick, MD 21701")).toBe(true);
    expect(looksLikeStreetAddress("59 S Carroll St")).toBe(true);
    expect(looksLikeStreetAddress("1781 N Market")).toBe(true); // digit start alone suffices
  });

  it("accepts a street suffix even without a leading number", () => {
    expect(looksLikeStreetAddress("Sky Stage, S Carroll Street, Frederick")).toBe(true);
    expect(looksLikeStreetAddress("Frederick Fairgrounds, E Patrick St")).toBe(true);
    expect(looksLikeStreetAddress("Old National Pike")).toBe(true);
    expect(looksLikeStreetAddress("Opossumtown Pkwy")).toBe(true);
  });

  it("rejects town names, venue names, and city tails", () => {
    expect(looksLikeStreetAddress("Frederick")).toBe(false);
    expect(looksLikeStreetAddress("Downtown Frederick")).toBe(false);
    expect(looksLikeStreetAddress("Frederick, MD 21701")).toBe(false);
    expect(looksLikeStreetAddress("Baker Park Bandshell")).toBe(false);
    expect(looksLikeStreetAddress("Carroll Creek Amphitheater")).toBe(false);
  });

  it("rejects empty / null / whitespace", () => {
    expect(looksLikeStreetAddress("")).toBe(false);
    expect(looksLikeStreetAddress("   ")).toBe(false);
    expect(looksLikeStreetAddress(null)).toBe(false);
    expect(looksLikeStreetAddress(undefined)).toBe(false);
  });

  it("does not fire on suffix words embedded in longer words", () => {
    expect(looksLikeStreetAddress("Historic Market House Tour")).toBe(false); // "Market" is not a suffix token
    expect(looksLikeStreetAddress("Squash Club Open House")).toBe(false); // "Sq" only as \b-bounded token
  });
});

describe("buildGeocodeQuery", () => {
  it("appends town and MD when absent", () => {
    expect(buildGeocodeQuery("123 Main St", "Thurmont")).toBe("123 Main St, Thurmont, MD");
  });

  it("keeps the address as-is when it already names the state", () => {
    expect(buildGeocodeQuery("123 Main St, Frederick, MD 21701", "Frederick")).toBe(
      "123 Main St, Frederick, MD 21701",
    );
    expect(buildGeocodeQuery("10 Water St, Thurmont, Maryland", "Thurmont")).toBe(
      "10 Water St, Thurmont, Maryland",
    );
  });

  it("does not duplicate a town the address already contains", () => {
    expect(buildGeocodeQuery("123 Main St, Mount Airy", "Mount Airy")).toBe(
      "123 Main St, Mount Airy, MD",
    );
  });

  it("appends only MD when no town is known", () => {
    expect(buildGeocodeQuery("123 Main St")).toBe("123 Main St, MD");
  });
});

describe("normalizeAddressKey", () => {
  it("collapses case, punctuation, and whitespace variants to one key", () => {
    const a = normalizeAddressKey("123 Main St., Frederick, MD 21701");
    const b = normalizeAddressKey("123  MAIN ST Frederick MD 21701");
    expect(a).toBe(b);
    expect(a).toBe("123 main st frederick md 21701");
  });
});

describe("parseGeocodeResponse (county-bounds + precision gates)", () => {
  it("accepts an in-county address result", () => {
    // Downtown Frederick.
    expect(parseGeocodeResponse(v6Response(-77.4109, 39.4137))).toEqual({
      lng: -77.4109,
      lat: 39.4137,
    });
  });

  it("rejects a result outside Frederick County", () => {
    // Baltimore: inside Maryland, far outside the county polygon.
    expect(parseGeocodeResponse(v6Response(-76.6122, 39.2904))).toBeNull();
    // Smithsburg (Washington County): inside the bbox, outside the county
    // ring — the exact trap isValidCoord's polygon test exists for.
    expect(parseGeocodeResponse(v6Response(-77.5728, 39.6551))).toBeNull();
  });

  it("rejects centroid-grade feature types (place/postcode/locality)", () => {
    // Swapping a town centroid for Mapbox's town centroid is no upgrade.
    for (const ft of ["place", "postcode", "locality", "region"]) {
      expect(parseGeocodeResponse(v6Response(-77.4109, 39.4137, ft))).toBeNull();
    }
    // street/block are still precise enough to pin.
    expect(parseGeocodeResponse(v6Response(-77.4109, 39.4137, "street"))).not.toBeNull();
  });

  it("returns null for empty or malformed payloads", () => {
    expect(parseGeocodeResponse({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(parseGeocodeResponse({})).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse({ features: [{ properties: { feature_type: "address" } }] })).toBeNull();
  });
});

describe("geocodeForwardUncached (mocked fetch — never hits the network)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("geocodes via the v6 forward endpoint and returns an in-county hit", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(v6Response(-77.4145, 39.4157)), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const coord = await geocodeForwardUncached("101 Clarke Pl, Frederick, MD");
    expect(coord).toEqual({ lng: -77.4145, lat: 39.4157 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://api.mapbox.com/search/geocode/v6/forward");
    expect(url).toContain("q=101%20Clarke%20Pl%2C%20Frederick%2C%20MD");
    expect(url).toContain("proximity=-77.41,39.41");
    expect(url).toContain("country=US");
    expect(url).toContain("limit=1");
    expect(url).toContain("types=address,street,block");
    // Load-bearing in prod: the URL-restricted token 403s any server
    // fetch that omits the frederickradius.app Referer (all Mapbox APIs).
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).get("referer")).toBe("https://frederickradius.app/");
  });

  it("returns null (definitive miss) for an out-of-county result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(v6Response(-76.6122, 39.2904)), { status: 200 }),
      ),
    );
    expect(await geocodeForwardUncached("100 N Charles St, Baltimore")).toBeNull();
  });

  it("throws on an HTTP error so a transient failure is never cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    await expect(geocodeForwardUncached("123 Main St, Frederick, MD")).rejects.toThrow(
      "mapbox-geocode HTTP 429",
    );
  });
});
