import { describe, it, expect } from "vitest";
import { isDowntownFrederick, frederickAreaLabel } from "./downtown";

describe("isDowntownFrederick", () => {
  it("classifies real downtown points as inside", () => {
    expect(isDowntownFrederick({ lng: -77.409599, lat: 39.421638 })).toBe(true); // Gravel & Grind, 15 E 6th St
    expect(isDowntownFrederick({ lng: -77.41, lat: 39.412 })).toBe(true); // Carroll Creek
  });
  it("classifies west-side / Golden Mile points as outside", () => {
    expect(isDowntownFrederick({ lng: -77.451, lat: 39.421 })).toBe(false); // Golden Mile (Rt 40 W)
    expect(isDowntownFrederick({ lng: -77.46, lat: 39.4 })).toBe(false); // west-side
  });
  it("is safe on missing/garbage coordinates", () => {
    expect(isDowntownFrederick(null)).toBe(false);
    expect(isDowntownFrederick(undefined)).toBe(false);
    expect(isDowntownFrederick({ lng: NaN, lat: NaN } as never)).toBe(false);
  });
});

describe("frederickAreaLabel", () => {
  it('labels a downtown Frederick-city location "Downtown Frederick"', () => {
    expect(frederickAreaLabel("frederick", "Frederick", { lng: -77.409599, lat: 39.421638 })).toBe("Downtown Frederick");
  });
  it('keeps a west-side Frederick-city location "Frederick"', () => {
    expect(frederickAreaLabel("frederick", "Frederick", { lng: -77.451, lat: 39.421 })).toBe("Frederick");
  });
  it("never touches other towns", () => {
    expect(frederickAreaLabel("brunswick", "Brunswick", { lng: -77.62, lat: 39.31 })).toBe("Brunswick");
    expect(frederickAreaLabel("thurmont", "Thurmont", null)).toBe("Thurmont");
  });
});
