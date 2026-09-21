import { describe, expect, it } from "vitest";

import {
  clearFairLayoutParams,
  FAIR_BOOTH_SELECTION_HISTORY_KEY,
  fairBoothSelectionHasBackEntry,
  fairBoothShareUrl,
  readFairLayoutRoute,
} from "./layout-navigation";

describe("Fair booth navigation", () => {
  it("preserves the grounds default and existing vendor and meeting links", () => {
    expect(readFairLayoutRoute("/moments/great-frederick-fair-2026").view).toBe("grounds");
    for (const existing of ["vendor=vendor-white-rabbit-rad-pies", "meet=gate-1"]) {
      expect(readFairLayoutRoute(`/?layout=booths&${existing}`).view).toBe("grounds");
    }
  });

  it("reads and bounds shared selections and queries", () => {
    expect(readFairLayoutRoute("/?layout=booths&floor=9566&booth=9566%3A3353619&bq=Rad+Pies"))
      .toEqual({ view: "booths", floor: "9566", booth: "9566:3353619", query: "Rad Pies" });
    const invalid = readFairLayoutRoute(`/?layout=booths&floor=bad&booth=oops&bq=${"x".repeat(200)}`);
    expect(invalid.floor).toBe("9566");
    expect(invalid.booth).toBeNull();
    expect(invalid.query).toHaveLength(120);
  });

  it("shares only the public selection, never a visitor's query or plan", () => {
    const url = new URL(fairBoothShareUrl("https://frederickradius.app", "9566", "9566:3353619"));
    expect(url.pathname).toBe("/moments/great-frederick-fair-2026");
    expect([...url.searchParams.keys()]).toEqual(["layout", "floor", "booth"]);
    expect(url.hash).toBe("#fair-map");
    expect(() => fairBoothShareUrl(url.origin, "9564", "9566:3353619")).toThrow();
    expect(() => fairBoothShareUrl(url.origin, "9566", "invalid")).toThrow();
  });

  it("clears booth state without erasing other Fair or county context", () => {
    const url = new URL("https://frederickradius.app/?layout=booths&floor=9566&booth=9566:1&bq=pizza&town=brunswick&day=2026-09-21");
    clearFairLayoutParams(url);
    expect(url.searchParams.toString()).toBe("town=brunswick&day=2026-09-21");
  });

  it("never turns a direct shared selection into a back entry when replaced", () => {
    expect(fairBoothSelectionHasBackEntry(null, null)).toBe(true);
    expect(fairBoothSelectionHasBackEntry("9566:3353619", null)).toBe(false);
    expect(fairBoothSelectionHasBackEntry("9566:3353619", {})).toBe(false);
    expect(fairBoothSelectionHasBackEntry("9566:3353619", { [FAIR_BOOTH_SELECTION_HISTORY_KEY]: true })).toBe(true);
    expect(fairBoothSelectionHasBackEntry("9566:3353619", { [FAIR_BOOTH_SELECTION_HISTORY_KEY]: "true" })).toBe(false);
  });
});
