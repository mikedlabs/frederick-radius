import { describe, expect, it } from "vitest";
import { buildDaypartRows } from "./daypartPicks";

describe("buildDaypartRows", () => {
  it("keeps the current meal visible while the category browser is collapsed", () => {
    const lunch = buildDaypartRows(new Date("2026-07-20T17:00:00.000Z"));
    const rainyLunch = buildDaypartRows(
      new Date("2026-07-20T17:00:00.000Z"),
      "wet",
    );
    const dinner = buildDaypartRows(new Date("2026-07-20T22:00:00.000Z"));

    expect(lunch.map((row) => row.category)).toContain("restaurant");
    expect(rainyLunch.map((row) => row.category)).toContain("restaurant");
    expect(dinner.map((row) => row.category)).toContain("restaurant");
  });

  it("uses clearly labeled likely-open picks when fresh confirmed hours are unavailable", () => {
    const rows = buildDaypartRows(new Date("2026-07-26T17:00:00.000Z"));
    const picks = rows.flatMap((row) => row.picks);

    expect(picks.length).toBeGreaterThan(0);
    expect(picks.some((pick) => pick.confidence === "likely")).toBe(true);
    expect(
      picks
        .filter((pick) => pick.confidence === "likely")
        .every((pick) => pick.fact === "Likely open"),
    ).toBe(true);
  });

  it("starts the morning coffee shelf with coffee destinations, not boba", () => {
    const rows = buildDaypartRows(new Date("2026-07-31T12:00:00.000Z"));
    const coffee = rows.find((row) => row.category === "coffee");

    expect(coffee?.picks.length).toBeGreaterThan(0);
    expect(
      coffee?.picks.every(
        (pick) => !/\b(?:boba|bubble tea|tea emporium)\b/i.test(pick.name),
      ),
    ).toBe(true);
    expect(coffee?.picks[0]?.name).not.toMatch(/\b(?:starbucks|dunkin'?|wawa)\b/i);
  });

  it("keeps lodging records out of the breakfast bakery shelf", () => {
    const rows = buildDaypartRows(new Date("2026-07-31T12:00:00.000Z"));
    const bakery = rows.find((row) => row.category === "bakery");

    expect(bakery?.picks.length).toBeGreaterThan(0);
    expect(
      bakery?.picks.every((pick) => !/\b(?:bed and breakfast|b&b|inn)\b/i.test(pick.name)),
    ).toBe(true);
  });
});
