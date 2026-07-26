import { describe, expect, it } from "vitest";
import { buildDaypartRows } from "./daypartPicks";

describe("buildDaypartRows", () => {
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
