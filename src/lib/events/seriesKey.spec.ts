import { describe, expect, it } from "vitest";
import { eventSeriesKey } from "./seriesKey";

describe("eventSeriesKey", () => {
  it("normalizes storytime variations to the same key", () => {
    const titles = [
      "Family Storytime at C. Burr Artz",
      "Preschool Storytime",
      "Toddler Storytime at Brunswick Library",
      "Baby Storytime",
      "Musical Storytime",
    ];

    const keys = titles.map(eventSeriesKey);

    expect(keys[0]).toBe("storytime");
    expect(keys[1]).toBe("storytime");
    expect(keys[2]).toBe("storytime");
    expect(keys[3]).toBe("storytime");
    expect(keys[4]).toBe("storytime");
  });

  it("strips common prefixes", () => {
    expect(eventSeriesKey("Family Yoga")).toBe("yoga");
    expect(eventSeriesKey("Morning Yoga")).toBe("yoga");
    expect(eventSeriesKey("Evening Yoga")).toBe("yoga");
    expect(eventSeriesKey("Afternoon Yoga")).toBe("yoga");
  });

  it("truncates at venue/presenter markers", () => {
    expect(eventSeriesKey("Storytime at C. Burr Artz")).toBe("storytime");
    expect(eventSeriesKey("Concert with The Band")).toBe("concert");
    expect(eventSeriesKey("Workshop featuring Artist Name")).toBe("workshop");
  });

  it("removes time-of-day phrases", () => {
    expect(eventSeriesKey("Morning Coffee Hour")).toBe("coffee hour");
    expect(eventSeriesKey("Afternoon Tea Party")).toBe("tea party");
    expect(eventSeriesKey("Evening Concert 7:00 PM")).toBe("concert");
  });

  it("handles punctuation and spacing", () => {
    expect(eventSeriesKey("Story-Time!")).toBe("story time");
    expect(eventSeriesKey("Kids' Art Class")).toBe("kids art class");
    expect(eventSeriesKey("Build  &  Play")).toBe("build play");
  });

  it("preserves distinct series", () => {
    expect(eventSeriesKey("Toddler Skills")).toBe("skills");
    expect(eventSeriesKey("School Skills")).toBe("school skills");
    expect(eventSeriesKey("Play and Learn")).toBe("play and learn");
    expect(eventSeriesKey("Build and Play")).toBe("build and play");
  });

  it("returns normalized title when no patterns match", () => {
    const title = "Unique One-Time Event";
    expect(eventSeriesKey(title)).toBe("unique one time event");
  });

  it("handles empty or whitespace-only titles", () => {
    expect(eventSeriesKey("")).toBe("");
    expect(eventSeriesKey("   ")).toBe("");
  });

  it("is case-insensitive", () => {
    expect(eventSeriesKey("STORYTIME")).toBe("storytime");
    expect(eventSeriesKey("StoryTime")).toBe("storytime");
    expect(eventSeriesKey("story time")).toBe("story time");
  });

  it("produces the same key for recurring events across towns", () => {
    const brunswickStorytime = eventSeriesKey("Family Storytime at Brunswick Library");
    const fredericStorytime = eventSeriesKey("Family Storytime at C. Burr Artz");
    const thurmontStorytime = eventSeriesKey("Family Storytime at Thurmont Regional");

    expect(brunswickStorytime).toBe(fredericStorytime);
    expect(fredericStorytime).toBe(thurmontStorytime);
    expect(brunswickStorytime).toBe("storytime");
  });

  it("strips location and variant suffixes", () => {
    expect(eventSeriesKey("Strength & Stretch @ Brunswick")).toBe("strength stretch");
    expect(eventSeriesKey("Strength & Stretch @ Frederick")).toBe("strength stretch");
    expect(eventSeriesKey("Game Time (Hybrid)")).toBe("game time");
    expect(eventSeriesKey("Game Time (2nd Section)")).toBe("game time");
    expect(eventSeriesKey("Yoga Class & Virtual")).toBe("yoga class");
    expect(eventSeriesKey("Story Time and Virtual")).toBe("story time");
  });
});
