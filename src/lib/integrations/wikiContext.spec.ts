import { describe, it, expect } from "vitest";
import { wikipediaGeoUrl, normalizeWikiPages } from "./wikiContext";

const FRED = { lat: 39.4143, lng: -77.4105 };

describe("wikipediaGeoUrl", () => {
  it("encodes the geosearch generator query", () => {
    const u = new URL(wikipediaGeoUrl(FRED.lat, FRED.lng, { radiusM: 1200, limit: 6 }));
    expect(u.searchParams.get("generator")).toBe("geosearch");
    expect(u.searchParams.get("ggscoord")).toBe("39.4143|-77.4105");
    expect(u.searchParams.get("ggsradius")).toBe("1200");
    expect(u.searchParams.get("ggslimit")).toBe("6");
    expect(u.searchParams.get("explaintext")).toBe("1");
  });

  it("clamps radius and limit to sane bounds", () => {
    const u = new URL(wikipediaGeoUrl(FRED.lat, FRED.lng, { radiusM: 99_999, limit: 999 }));
    expect(u.searchParams.get("ggsradius")).toBe("10000");
    expect(u.searchParams.get("ggslimit")).toBe("20");
  });
});

const SAMPLE = {
  query: {
    pages: {
      "2703378": {
        pageid: 2703378,
        title: "Weinberg Center",
        extract: "The Weinberg Center is a 1,143-seat theater in Frederick, Maryland.",
        coordinates: [{ lat: 39.4148, lon: -77.4109 }],
        thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
      },
      "999": {
        pageid: 999,
        title: "Far Away Thing",
        extract: "Something farther north.",
        coordinates: [{ lat: 39.44, lon: -77.41 }],
      },
      "111": {
        // dropped — no extract
        pageid: 111, title: "Stub", coordinates: [{ lat: 39.4143, lon: -77.4105 }],
      },
      "222": {
        // dropped — no coordinate
        pageid: 222, title: "No Coord", extract: "Text.",
      },
    },
  },
};

describe("normalizeWikiPages", () => {
  it("keeps pages with title+extract+coord, sorted nearest-first", () => {
    const out = normalizeWikiPages(SAMPLE, FRED);
    expect(out.map((p) => p.title)).toEqual(["Weinberg Center", "Far Away Thing"]);
    expect(out[0].distanceM).toBeLessThan(out[1].distanceM);
  });

  it("builds a canonical article URL and carries the thumbnail", () => {
    const out = normalizeWikiPages(SAMPLE, FRED);
    expect(out[0].url).toBe("https://en.wikipedia.org/wiki/Weinberg_Center");
    expect(out[0].thumbnail).toBe("https://upload.wikimedia.org/x.jpg");
    expect(out[1].thumbnail).toBeUndefined();
  });

  it("returns [] on junk input", () => {
    expect(normalizeWikiPages(null, FRED)).toEqual([]);
    expect(normalizeWikiPages({ query: {} }, FRED)).toEqual([]);
  });
});
