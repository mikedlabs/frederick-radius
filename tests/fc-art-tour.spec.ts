import { describe, it, expect } from "vitest";
import { normalizeArt } from "@/lib/integrations/fcArtTour";

// Real ArcGIS field names + shape (confirmed live against
// Frederick_Art_Tour/MapServer/0). Frederick County ~39.3-39.7 /
// -77.7--77.15. f=geojson Point geometry = [lng, lat].
const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "Point", coordinates: [-77.4105, 39.4143] },
      properties: {
        OBJECTID: 255,
        NAME: "Balloons Over Frederick",
        TAB_NAME: "Community Canvas",
        ARTIST: "", // blank -> must fall back to the "Artist:" DESC line
        SHORT_DESC: "Balloons Over Frederick", // == NAME -> not a blurb
        DESC1: "Year Dedicated: 2016",
        DESC2: "Centennial Park 630 Eighth St.",
        DESC3: "Artist: Bethany Steen",
        DESC4: "",
        DESC5: "",
        PIC_URL: "https://gis.frederickco.gov/ArtWeb/Pictures/Balloons.jpg",
        THUMB_URL: "https://gis.frederickco.gov/ArtWeb/Thumbnails/Balloons.jpg",
        WEBSITE: "https://www.cityoffrederickmd.gov/centennial",
      },
    },
    {
      geometry: { type: "Point", coordinates: [-77.4109, 39.4128] },
      properties: {
        OBJECTID: 256,
        NAME: "Community Bridge",
        TAB_NAME: "Murals",
        ARTIST: "William Cochran", // field set -> wins over any DESC line
        SHORT_DESC: "A trompe-l'oeil illusion mural", // != NAME -> blurb
        DESC1: "Year Dedicated: 1998",
        DESC2: "Carroll Creek 1 S Carroll St.",
        DESC3: "Painted illusionary stonework",
        PIC_URL: "https://gis.frederickco.gov/ArtWeb/Pictures/Bridge.jpg",
        THUMB_URL: "",
      },
    },
    // No SHORT_DESC, two leftover descriptive lines -> blurb joins them.
    {
      geometry: { type: "Point", coordinates: [-77.39, 39.42] },
      properties: {
        OBJECTID: 257,
        NAME: "Spirit of the Wind",
        TAB_NAME: "Sculptures",
        DESC1: "Baker Park",
        DESC2: "Kinetic wind sculpture",
        DESC3: "Stainless steel",
        PIC_URL: "ArtWeb/Pictures/relative.jpg", // not http -> dropped
        WEBSITE: "not-a-url",
      },
    },
    // nameless -> dropped
    {
      geometry: { type: "Point", coordinates: [-77.41, 39.41] },
      properties: { OBJECTID: 999 },
    },
    // non-point geometry -> dropped
    {
      geometry: { type: "Polygon", coordinates: [[[-77.4, 39.4]]] },
      properties: { OBJECTID: 998, NAME: "Phantom Polygon" },
    },
    // out of county (Baltimore) -> dropped
    {
      geometry: { type: "Point", coordinates: [-76.61, 39.29] },
      properties: { OBJECTID: 997, NAME: "Baltimore Mural" },
    },
    // duplicate OBJECTID 255 -> deduped
    {
      geometry: { type: "Point", coordinates: [-77.4105, 39.4143] },
      properties: { OBJECTID: 255, NAME: "Balloons Over Frederick (dupe)" },
    },
  ],
};

describe("normalizeArt", () => {
  it("parses artist/year/location/images, falling back ARTIST field -> DESC", () => {
    const out = normalizeArt(raw);
    const balloons = out.find((a) => a.name === "Balloons Over Frederick");
    expect(balloons).toBeTruthy();
    expect(balloons!.category).toBe("Community Canvas");
    expect(balloons!.artist).toBe("Bethany Steen"); // ARTIST blank -> DESC3
    expect(balloons!.year).toBe("2016");
    expect(balloons!.location).toBe("Centennial Park 630 Eighth St.");
    expect(balloons!.blurb).toBeUndefined(); // SHORT_DESC == NAME
    expect(balloons!.thumbUrl).toContain("/Thumbnails/Balloons.jpg");
    expect(balloons!.imageUrl).toContain("/Pictures/Balloons.jpg");
    expect(balloons!.website).toContain("cityoffrederickmd.gov");
    expect(balloons!.municipality).toBeTruthy();
  });

  it("ARTIST field wins; SHORT_DESC (!= name) becomes the blurb; THUMB falls back to PIC", () => {
    const bridge = normalizeArt(raw).find((a) => a.name === "Community Bridge");
    expect(bridge!.artist).toBe("William Cochran");
    expect(bridge!.year).toBe("1998");
    expect(bridge!.location).toBe("Carroll Creek 1 S Carroll St.");
    expect(bridge!.blurb).toBe("A trompe-l'oeil illusion mural");
    expect(bridge!.thumbUrl).toContain("/Pictures/Bridge.jpg"); // THUMB "" -> PIC
  });

  it("joins leftover DESC lines as the blurb and drops non-http urls", () => {
    const spirit = normalizeArt(raw).find((a) => a.name === "Spirit of the Wind");
    expect(spirit!.location).toBe("Baker Park");
    expect(spirit!.blurb).toBe("Kinetic wind sculpture · Stainless steel");
    expect(spirit!.imageUrl).toBeUndefined(); // relative path -> not kept
    expect(spirit!.thumbUrl).toBeUndefined();
    expect(spirit!.website).toBeUndefined(); // "not-a-url" -> dropped
  });

  it("drops nameless, non-point, out-of-county; dedupes by OBJECTID", () => {
    const names = normalizeArt(raw).map((a) => a.name);
    expect(names).toEqual([
      "Balloons Over Frederick",
      "Community Bridge",
      "Spirit of the Wind",
    ]);
    expect(names).not.toContain("Phantom Polygon");
    expect(names).not.toContain("Baltimore Mural");
    expect(names).not.toContain("Balloons Over Frederick (dupe)");
  });

  it("returns [] for junk input", () => {
    expect(normalizeArt(null)).toEqual([]);
    expect(normalizeArt({})).toEqual([]);
    expect(normalizeArt({ features: "nope" })).toEqual([]);
  });
});
