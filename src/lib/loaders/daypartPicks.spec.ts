import { describe, expect, it } from "vitest";
import { buildDaypartRows } from "./daypartPicks";
import { chainBrandKey } from "@/lib/category-ranking";

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
        // The exact string /api/want's live refresh substitutes, so the
        // server paint does not visibly change a moment after it lands.
        .every((pick) => pick.fact === "Likely open · check hours"),
    ).toBe(true);
  });

  it("never leaves a pick without a fact, so the 'Open now' fallback is dead", () => {
    // The shipped bug: confirmed picks arrived with fact === null, so
    // DaypartNeeds fell back to the literal string "Open now" and Today's one
    // location-aware answer opened by saying the same two words four times.
    // isOpenNow had already run on those exact objects to select them.
    //
    // Asserted as an invariant over every hour rather than against a fixture
    // date. Whether any given hour yields confirmed or likely picks depends on
    // the committed hours snapshot, but "every pick states something" must
    // hold at 3am and at noon alike, and it is the condition that makes the
    // component's fallback unreachable.
    for (const hour of [8, 12, 17, 21]) {
      const rows = buildDaypartRows(
        new Date(`2026-08-02T${String(hour).padStart(2, "0")}:00:00.000Z`),
      );
      const picks = rows.flatMap((row) => row.picks);
      expect(picks.length).toBeGreaterThan(0);
      for (const pick of picks) {
        expect(pick.fact).toBeTruthy();
        expect(pick.fact).not.toBe("Open now");
      }
    }
  });

  it("uses formatHoursLine's own vocabulary for a confirmed pick", () => {
    // Guards the SHAPE of the confirmed string without asserting that any
    // particular hour has confirmed picks. A confirmed pick is by definition
    // one isOpenNow accepted, so only the open-state phrasings are reachable.
    const confirmed = [8, 12, 17, 21]
      .flatMap((hour) =>
        buildDaypartRows(
          new Date(`2026-08-02T${String(hour).padStart(2, "0")}:00:00.000Z`),
        ),
      )
      .flatMap((row) => row.picks)
      .filter((pick) => pick.confidence === "confirmed");

    for (const pick of confirmed) {
      expect(pick.fact).toMatch(/^(Open until .+|Open 24 hours|Closing soon · .+)$/);
    }
  });

  it("starts the morning coffee shelf with coffee destinations, not boba", () => {
    const rows = buildDaypartRows(new Date("2026-08-07T12:00:00.000Z"));
    const coffee = rows.find((row) => row.category === "coffee");

    expect(coffee?.picks.length).toBeGreaterThan(0);
    expect(
      coffee?.picks.every(
        (pick) => !/\b(?:boba|bubble tea|tea emporium)\b/i.test(pick.name),
      ),
    ).toBe(true);
    expect(coffee?.picks[0]?.name).not.toMatch(/\b(?:starbucks|dunkin'?|wawa)\b/i);
  });

  it("does not spend a short coffee shelf on duplicate chain locations", () => {
    for (const hour of [8, 12, 17, 21]) {
      const rows = buildDaypartRows(
        new Date(`2026-08-08T${String(hour).padStart(2, "0")}:00:00.000Z`),
      );
      const coffee = rows.find((row) => row.category === "coffee");
      const chainKeys = (coffee?.picks ?? [])
        .map((pick) => chainBrandKey(pick.name))
        .filter((key): key is string => Boolean(key));
      expect(new Set(chainKeys).size).toBe(chainKeys.length);
    }
  });

  it("keeps lodging records out of the breakfast bakery shelf", () => {
    const rows = buildDaypartRows(new Date("2026-08-07T12:00:00.000Z"));
    const bakery = rows.find((row) => row.category === "bakery");

    expect(bakery?.picks.length).toBeGreaterThan(0);
    expect(
      bakery?.picks.every((pick) => !/\b(?:bed and breakfast|b&b|inn)\b/i.test(pick.name)),
    ).toBe(true);
  });
});
