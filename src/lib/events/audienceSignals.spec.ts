import { describe, expect, it } from "vitest";
import { audienceFromText } from "./audienceSignals";

describe("audienceFromText", () => {
  it("tags little-kid programming from the publisher's own words", () => {
    expect(audienceFromText("Toddler Storytime", "")).toEqual([
      "kids-0-5",
    ]);
    expect(audienceFromText("Preschool music and movement")).toEqual([
      "kids-0-5",
    ]);
  });

  it("tags school-age and family programming", () => {
    expect(audienceFromText("Kids' LEGO club")).toEqual(["kids-6-12"]);
    expect(
      audienceFromText("Family-friendly outdoor movie night"),
    ).toEqual(["kids-6-12"]);
  });

  it("lets an explicit age gate beat every kid-sounding word", () => {
    expect(
      audienceFromText("Adults-only trivia for big kids at heart", "21+"),
    ).toEqual(["adults"]);
  });

  it("stays silent when the publisher said nothing about audience", () => {
    expect(audienceFromText("Board of County Commissioners meeting")).toEqual([]);
    expect(audienceFromText("", null, undefined)).toEqual([]);
  });

  it("never mistakes family law or unrelated words for kid programming", () => {
    expect(audienceFromText("Family law self-help clinic")).toEqual([]);
  });
});
