import { describe, it, expect } from "vitest";
import { splitLocation } from "./ical-live";

describe("splitLocation venue sanity", () => {
  it("rejects a location field that is actually a description dump", () => {
    // The live Bee City subcommittee feed put its description in LOCATION.
    expect(
      splitLocation(
        "Description: Did you know Frederick City & County are Bee Cities? A Bee City brings people together.",
        "Frederick",
      ).venue,
    ).toBe("Frederick");
  });

  it("keeps real venue names (incl. abbreviations and apostrophes)", () => {
    expect(splitLocation("Carroll Creek Amphitheater, Frederick, MD", "x").venue).toBe(
      "Carroll Creek Amphitheater",
    );
    expect(splitLocation("Brewer's Alley, Frederick", "x").venue).toBe("Brewer's Alley");
    expect(splitLocation("St. John Regional Catholic Church", "x").venue).toBe(
      "St. John Regional Catholic Church",
    );
  });

  it("falls back when location is empty", () => {
    expect(splitLocation("", "Default Venue").venue).toBe("Default Venue");
    expect(splitLocation(undefined, "Default Venue").venue).toBe("Default Venue");
  });
});
