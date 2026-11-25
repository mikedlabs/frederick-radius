import { describe, expect, it } from "vitest";
import { activeServiceIds, formatMarcClock, getMarcBoard, marcClockMinutes } from "./marcTrains";

describe("MARC clock labels", () => {
  it("turns GTFS 24-hour values into readable 12-hour clocks", () => {
    expect(formatMarcClock("00:05")).toBe("12:05 AM");
    expect(formatMarcClock("12:30")).toBe("12:30 PM");
    expect(formatMarcClock("17:40")).toBe("5:40 PM");
  });

  it("orders both raw and display formats by minutes from midnight", () => {
    expect(marcClockMinutes("06:15")).toBe(375);
    expect(marcClockMinutes("5:40 PM")).toBe(1060);
  });
});

describe("MARC Brunswick Line Thanksgiving service", () => {
  it.each([["20261126", 3], ["20261127", 4]] as const)("overrides a conflicting GTFS addition on %s on the map and board", async (ymd, weekday) => {
    const schedule = {
      calendar: { regular: { days: [1, 1, 1, 1, 1, 1, 1], start: "20260101", end: "20261231" } },
      exceptions: { [ymd]: { added: ["extra"], removed: [] } },
      stops: {},
    };
    expect(activeServiceIds(ymd, weekday, schedule).size).toBe(0);
    expect([...activeServiceIds("20261130", 0, schedule)]).toEqual(["regular"]);
    const board = await getMarcBoard(new Date(`2026-11-${ymd.slice(6)}T08:00:00-05:00`));
    expect(board.serviceToday).toBe(false);
    expect(board.stations.every(({ departures }) => !departures.eb.length && !departures.wb.length)).toBe(true);
  });
});
