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
});
