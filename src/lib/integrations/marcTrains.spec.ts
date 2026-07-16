import { describe, expect, it } from "vitest";
import { formatMarcClock, marcClockMinutes } from "./marcTrains";

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
