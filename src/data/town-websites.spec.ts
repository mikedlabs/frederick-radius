import { describe, expect, it } from "vitest";
import { findTownCivicResource } from "@/data/town-websites";

describe("findTownCivicResource", () => {
  it("routes a city-context trash question to the City of Frederick", () => {
    expect(findTownCivicResource("When is trash pickup?", "frederick")).toMatchObject({
      label: "Trash & recycling",
      url: "https://www.cityoffrederickmd.gov/220/Refuse-Recycling",
      town: { slug: "frederick" },
    });
  });

  it("uses a named town instead of the location context", () => {
    expect(findTownCivicResource("Where are Mount Airy permits?", "frederick")).toMatchObject({
      label: "Permits & planning",
      town: { slug: "mount-airy" },
    });
  });

  it("does not confuse Frederick County with the City of Frederick", () => {
    expect(findTownCivicResource("Frederick County trash", "frederick")).toBeNull();
  });
});
