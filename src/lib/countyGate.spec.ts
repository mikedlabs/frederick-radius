import { describe, it, expect } from "vitest";
import { isInFrederickCountyArea, isValidCoord } from "@/lib/geo";

/**
 * County gate tests (2026-06 redesign audit, ranking-trust blocker).
 * The bbox test alone passed Washington and Carroll County records
 * that wore member-town labels; the polygon plus explicit Mount Airy
 * exception must keep every real member place and reject every audited
 * foreigner.
 */
describe("isInFrederickCountyArea", () => {
  it("keeps the county core and every member town center", () => {
    const members: Array<[string, number, number]> = [
      ["Downtown Frederick", -77.4105, 39.4143],
      ["Brunswick", -77.6277, 39.3140],
      ["Thurmont", -77.4108, 39.6237],
      ["Middletown", -77.5447, 39.4437],
      ["Walkersville", -77.3522, 39.4862],
      ["Emmitsburg", -77.3266, 39.7042],
      ["New Market", -77.2697, 39.3829],
      ["Myersville", -77.5664, 39.5051],
      ["Woodsboro", -77.3147, 39.5332],
      ["Burkittsville", -77.6261, 39.3926],
      ["Urbana", -77.3514, 39.3259],
    ];
    for (const [name, lng, lat] of members) {
      expect(isInFrederickCountyArea(lng, lat), name).toBe(true);
    }
  });

  it("keeps Mount Airy even though its Main Street straddles the Carroll line", () => {
    // Mount Airy center sits on the boundary; the reviewed Carroll-side
    // portion of the town remains part of Radius's county guide.
    expect(isInFrederickCountyArea(-77.1547, 39.3762)).toBe(true);
    // A point ~700m east of the line (Carroll side, still Mount Airy).
    expect(isInFrederickCountyArea(-77.148, 39.376)).toBe(true);
  });

  it("rejects the audited foreigners that the bbox passed", () => {
    // Smithsburg, Washington County (the guide's junk "Best match").
    expect(isInFrederickCountyArea(-77.5728, 39.6556)).toBe(false);
    // Boonsboro, Washington County (coffee shops tagged myersville).
    expect(isInFrederickCountyArea(-77.6522, 39.5062)).toBe(false);
    // The Lodge in Boonsboro was incorrectly labeled Myersville and counted
    // among the county's drinks because the old blanket border buffer passed.
    expect(isInFrederickCountyArea(-77.6159629, 39.553693)).toBe(false);
    // Rohrersville area, Washington County (winery tagged burkittsville).
    expect(isInFrederickCountyArea(-77.6592, 39.4304)).toBe(false);
  });

  it("rejects nonsense coordinates by construction", () => {
    expect(isInFrederickCountyArea(0, 0)).toBe(false);
    expect(isInFrederickCountyArea(NaN, 39.4)).toBe(false);
    expect(isValidCoord(null)).toBe(false);
    expect(isValidCoord({ lng: -77.0365, lat: 38.8977 })).toBe(false); // DC
  });
});
