import { describe, expect, it } from "vitest";
import { audienceFromAgeRanges, audienceFromText } from "./audienceSignals";

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

  it("parses (ages 11-18)-style ranges into kids/teens/adults hints", () => {
    expect(
      audienceFromAgeRanges(
        "Greetings Adventurers! Role Playing Games Club (Ages 11-18)",
      ),
    ).toEqual(["kids-6-12", "teens"]);
    expect(audienceFromAgeRanges("Teen Time: Edible Slime (ages 13-18)")).toEqual([
      "teens",
    ]);
    expect(audienceFromAgeRanges("Toddler Storytime (ages 2-3)")).toEqual([
      "kids-0-5",
    ]);
    expect(audienceFromAgeRanges("Book Pumpkins (Ages 14 & Up)")).toEqual([
      "teens",
    ]);
    expect(audienceFromAgeRanges("Stop the Bleed Training (Ages 13-adult)")).toEqual(
      ["teens", "adults"],
    );
    expect(
      audienceFromText("Greetings Adventurers! Role Playing Games Club (Ages 11-18)"),
    ).toEqual(["kids-6-12", "teens"]);
  });

  it("does not infer free admission from a library title", () => {
    const title = "Elementary Explorers: Art Exploration (ages 5-10)";
    expect(audienceFromText(title)).toContain("kids-6-12");
    expect(audienceFromText(title)).not.toContain("free");
  });
});
